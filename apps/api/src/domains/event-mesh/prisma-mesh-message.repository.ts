import { Prisma } from "@prisma/client";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  FIRST_SEQUENCE,
  type MeshMessage,
  type MeshMessageRepository,
  type PayloadRetention,
  UNCOMMITTED_POSITION,
} from "@knowget/event-mesh";
import { parseIso, toIso } from "@knowget/shared";
import type { CorrelationId, ISODateString, TenantId, Uuid } from "@knowget/types";

interface MeshMessageRow {
  id: string;
  tenantId: string;
  organizationId: string;
  streamKey: string;
  partition: number;
  partitionCount: number;
  partitionKey: string;
  sequence: number;
  eventId: string;
  eventTypeKey: string;
  eventTypeVersion: number;
  aggregateType: string;
  aggregateId: string;
  producerKey: string;
  correlationId: string;
  causationId: string | null;
  traceId: string;
  occurredAt: string;
  recordedAt: string;
  retention: string;
  payloadDigest: string | null;
  payload: unknown;
  payloadForgottenAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Re-render an instant in the fixed-width form `toISOString` produces.
 *
 * `recordedAt` is the one column in this domain read with an inequality, and it holds an ISO instant as text, so
 * that comparison is lexical rather than chronological. Fixed-width ISO orders lexically exactly as it orders in
 * time — but the platform's ISO type also admits the second-precision form, and `…T10:00:00.000Z` sorts *before*
 * `…T10:00:00Z` while naming the same moment, because `.` precedes `Z`. Every write and both ends of every read
 * bound go through here, so the column's lexical order is its chronological order and the question is asked in
 * the alphabet the answer is stored in.
 *
 * Getting this wrong would not fail loudly. A replay window would come back a few messages short, a retention
 * sweep would step over a body it was meant to forget, and both would look like they had run.
 *
 * `occurredAt` is stored exactly as the producer stated it, because nothing compares it — an obligation that
 * arrives with the next range filter somebody adds, not one this adapter can discharge on their behalf.
 */
const fixedWidth = (instant: ISODateString): ISODateString => toIso(parseIso(instant));

function toDomain(row: MeshMessageRow): MeshMessage {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    streamKey: row.streamKey,
    partition: row.partition,
    partitionCount: row.partitionCount,
    partitionKey: row.partitionKey,
    sequence: row.sequence,
    eventId: row.eventId as Uuid,
    eventTypeKey: row.eventTypeKey,
    eventTypeVersion: row.eventTypeVersion,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId as Uuid,
    producerKey: row.producerKey,
    correlationId: row.correlationId as CorrelationId,
    causationId: (row.causationId as Uuid | null) ?? null,
    traceId: row.traceId,
    occurredAt: row.occurredAt as ISODateString,
    recordedAt: row.recordedAt as ISODateString,
    retention: row.retention as PayloadRetention,
    payloadDigest: row.payloadDigest,
    payload: row.payload ?? null,
    payloadForgottenAt: (row.payloadForgottenAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(message: MeshMessage) {
  return {
    tenantId: message.tenantId,
    organizationId: message.organizationId,
    streamKey: message.streamKey,
    partition: message.partition,
    partitionCount: message.partitionCount,
    partitionKey: message.partitionKey,
    sequence: message.sequence,
    eventId: message.eventId,
    eventTypeKey: message.eventTypeKey,
    eventTypeVersion: message.eventTypeVersion,
    aggregateType: message.aggregateType,
    aggregateId: message.aggregateId,
    producerKey: message.producerKey,
    correlationId: message.correlationId,
    causationId: message.causationId,
    traceId: message.traceId,
    occurredAt: message.occurredAt,
    recordedAt: fixedWidth(message.recordedAt),
    retention: message.retention,
    payloadDigest: message.payloadDigest,
    payload: message.payload === null ? Prisma.DbNull : JSON.parse(JSON.stringify(message.payload)),
    payloadForgottenAt: message.payloadForgottenAt,
  };
}

/**
 * Prisma-backed {@link MeshMessageRepository} (RLS via {@link withTenant}).
 *
 * This is the largest table the platform will hold, and it is the one place where the difference between asking
 * narrowly and filtering broadly stops being a matter of taste. Every read below is bounded in SQL by a stream, a
 * partition, a window or a cutoff, and not one of them materializes a set in this process and then reduces it.
 * The port says so and this adapter is where the saying becomes true: a `countWindow` implemented as a fetch and
 * a `.length` would work perfectly for a year and then take a school's API down on the morning somebody asks to
 * replay a term.
 *
 * `nextSequence` and `streamHead` are the same shape and deliberately not the same read. The next sequence is a
 * fact about the whole stream, because the sequence is gapless across it; a head is a fact about one partition,
 * because a consumer reading eight partitions can be current on seven and stopped on the eighth, and a head
 * summed across them reports a healthy subscription with a dead partition inside it. Both take the top row of an
 * index rather than an aggregate, which is the read the composite index on stream, partition and sequence was
 * built for, and both answer the empty case with the constant the package defines rather than with a zero this
 * file invented — `FIRST_SEQUENCE` and `UNCOMMITTED_POSITION` are different numbers for good reasons.
 *
 * The window reads compare `recordedAt`, never `occurredAt`, for the reason the port gives: retention runs from
 * when the mesh took custody of a fact, so a window bounded by occurrence would ask for messages retained outside
 * it and a replay would be refused for a breach it did not commit. Both bounds are inclusive, matching the
 * package's own predicate, because a caller naming an hour means the hour.
 *
 * `listRetaining` spells out `full` and a present payload rather than deriving them from the package's
 * replayability predicate, and the duplication is deliberate: the pure predicate and this `WHERE` are two
 * statements of one rule that must agree, and no compiler checks that they do. What the clause buys is that a
 * digest-only stream and an already-swept message never reach this process at all, so a sweep run twice does the
 * work once — the sweep is the one operation here that deletes institutional content, and it should be cheap
 * enough that nobody is tempted to run it less often than the retention promise requires.
 *
 * There is no `listByTenant` and no `remove`, and both absences are the port's. A message is the record that a
 * fact crossed the mesh; deleting one leaves a gap in a gapless sequence, and every consumer that later reads
 * across it concludes it lost a message rather than that somebody removed one.
 */
export class PrismaMeshMessageRepository implements MeshMessageRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<MeshMessage | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.meshMessage.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /** How the mesh refuses to carry the same event twice when a relay retries a publication it never saw land. */
  findByEventId(tenantId: TenantId, eventId: Uuid): Promise<MeshMessage | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.meshMessage.findFirst({ where: { eventId } });
      return row ? toDomain(row) : null;
    });
  }

  /** The sequence the next message on this stream takes, read off the top of the index. */
  nextSequence(tenantId: TenantId, streamKey: string): Promise<number> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.meshMessage.findFirst({
        where: { streamKey },
        orderBy: { sequence: "desc" },
      });
      return row ? row.sequence + 1 : FIRST_SEQUENCE;
    });
  }

  /** The highest sequence on one partition, which is the only honest denominator for lag. */
  streamHead(tenantId: TenantId, streamKey: string, partition: number): Promise<number> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.meshMessage.findFirst({
        where: { streamKey, partition },
        orderBy: { sequence: "desc" },
      });
      return row ? row.sequence : UNCOMMITTED_POSITION;
    });
  }

  /** The number the replay ceiling is enforced against, counted by the store rather than estimated. */
  countWindow(
    tenantId: TenantId,
    streamKey: string,
    fromInstant: ISODateString,
    toInstant: ISODateString,
  ): Promise<number> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      return tx.meshMessage.count({
        where: {
          streamKey,
          recordedAt: { gte: fixedWidth(fromInstant), lte: fixedWidth(toInstant) },
        },
      });
    });
  }

  /** An approved replay walking exactly what it was approved for, in the order the stream carried it. */
  listWindow(
    tenantId: TenantId,
    streamKey: string,
    fromInstant: ISODateString,
    toInstant: ISODateString,
  ): Promise<MeshMessage[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.meshMessage.findMany({
        where: {
          streamKey,
          recordedAt: { gte: fixedWidth(fromInstant), lte: fixedWidth(toInstant) },
        },
        orderBy: { sequence: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  /** The retention sweep's worklist: bodies on one stream old enough to be forgotten, and still held. */
  listRetaining(
    tenantId: TenantId,
    streamKey: string,
    recordedBefore: ISODateString,
  ): Promise<MeshMessage[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.meshMessage.findMany({
        where: {
          streamKey,
          retention: "full",
          payload: { not: Prisma.DbNull },
          recordedAt: { lte: fixedWidth(recordedBefore) },
        },
        orderBy: { sequence: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  save(message: MeshMessage): Promise<void> {
    return withTenant(this.db, message.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(message);
      await tx.meshMessage.upsert({
        where: { id: message.id },
        create: { id: message.id, ...fields },
        update: fields,
      });
    });
  }
}
