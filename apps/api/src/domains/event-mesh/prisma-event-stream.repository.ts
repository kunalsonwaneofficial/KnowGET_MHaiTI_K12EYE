import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type EventStream,
  type EventStreamRepository,
  type OrderingGuarantee,
  type PayloadRetention,
  type StreamStatus,
  compareText,
  normalizeKey,
} from "@knowget/event-mesh";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface EventStreamRow {
  id: string;
  tenantId: string;
  organizationId: string;
  streamKey: string;
  title: string;
  summary: string;
  status: string;
  ordering: string;
  partitionCount: number;
  partitionKeyPath: string | null;
  retention: string;
  retentionSeconds: number;
  eventTypeKeys: string[];
  activatedAt: string | null;
  activatedBy: string | null;
  retiredAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: EventStreamRow): EventStream {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    streamKey: row.streamKey,
    title: row.title,
    summary: row.summary,
    status: row.status as StreamStatus,
    ordering: row.ordering as OrderingGuarantee,
    partitionCount: row.partitionCount,
    partitionKeyPath: row.partitionKeyPath,
    retention: row.retention as PayloadRetention,
    retentionSeconds: row.retentionSeconds,
    eventTypeKeys: row.eventTypeKeys,
    activatedAt: (row.activatedAt as ISODateString | null) ?? null,
    activatedBy: (row.activatedBy as Uuid | null) ?? null,
    retiredAt: (row.retiredAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(stream: EventStream) {
  return {
    tenantId: stream.tenantId,
    organizationId: stream.organizationId,
    streamKey: stream.streamKey,
    title: stream.title,
    summary: stream.summary,
    status: stream.status,
    ordering: stream.ordering,
    partitionCount: stream.partitionCount,
    partitionKeyPath: stream.partitionKeyPath,
    retention: stream.retention,
    retentionSeconds: stream.retentionSeconds,
    eventTypeKeys: [...stream.eventTypeKeys],
    activatedAt: stream.activatedAt,
    activatedBy: stream.activatedBy,
    retiredAt: stream.retiredAt,
  };
}

/** The port's documented order for the reverse lookup: code-point ascending, exactly as in memory. */
function byStreamKey(left: EventStream, right: EventStream): number {
  return compareText(left.streamKey, right.streamKey);
}

/**
 * Prisma-backed {@link EventStreamRepository} (RLS via {@link withTenant}).
 *
 * `eventTypeKeys` is `TEXT[]` rather than JSONB because it is a flat list of plain strings that the store has to
 * search *by member*, which is the one shape where the array type earns its keep: `listAcceptingEventType` asks
 * which streams contain a key, and Postgres answers that over a text array directly.
 *
 * That read normalizes its argument before asking, and the normalization is not decoration. A stream stores its
 * accepted keys already normalized, and the aggregate's own predicate normalizes what it is asked about, so an
 * adapter that passed the caller's spelling straight through would answer `false` for `Student.Enrolled` against
 * a stream carrying `student.enrolled` — and this read is what an operator consults before retiring an event
 * type. An empty answer there does not read as a bug; it reads as permission to retire.
 *
 * Its order is sorted in this process rather than in SQL, against exactly the comparator the port documents. A
 * stream key contains dots and hyphens, and a collation that gives those variable weight orders `student.a`
 * against `student-a` differently from the port's contract while looking correct in every in-memory test. The
 * deployment collation is `C.UTF-8` and would agree today; sorting here means the contract holds even where it
 * is not. The set is bounded by how many streams carry one event type, so the sort costs nothing.
 *
 * `listPublishable` spells out `active`, and it is one status rather than a range for a reason worth keeping in
 * front of whoever changes it: a `draft` stream has never been cleared to carry anything, a `paused` stream is
 * deliberately not accepting, and a `retired` one is a record. Widening this set is how a producer starts
 * writing to a stream somebody paused on purpose.
 *
 * The reads with no documented order are sorted by key, which is what somebody reading a stream catalogue
 * expects and what makes two environments diffable.
 *
 * There is no `remove`, and the port explains why: a stream key that could be reissued would hand a new stream
 * the messages, checkpoints and dead letters of an old one.
 */
export class PrismaEventStreamRepository implements EventStreamRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<EventStream | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.eventStream.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /** The one-stream-per-key rule, retired streams included — their keys stay taken. */
  findByKey(tenantId: TenantId, streamKey: string): Promise<EventStream | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.eventStream.findFirst({ where: { streamKey } });
      return row ? toDomain(row) : null;
    });
  }

  /** What a producer may write to right now, which is a smaller set than what was ever declared. */
  listPublishable(tenantId: TenantId, organizationId: Uuid): Promise<EventStream[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.eventStream.findMany({
        where: { organizationId, status: "active" },
        orderBy: { streamKey: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  /** Everything that would carry this event type, which is what makes retiring one an informed act. */
  listAcceptingEventType(tenantId: TenantId, eventTypeKey: string): Promise<EventStream[]> {
    const wanted = normalizeKey(eventTypeKey);
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.eventStream.findMany({ where: { eventTypeKeys: { has: wanted } } });
      return rows.map(toDomain).sort(byStreamKey);
    });
  }

  listByTenant(tenantId: TenantId): Promise<EventStream[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.eventStream.findMany({ orderBy: { streamKey: "asc" } });
      return rows.map(toDomain);
    });
  }

  save(stream: EventStream): Promise<void> {
    return withTenant(this.db, stream.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(stream);
      await tx.eventStream.upsert({
        where: { id: stream.id },
        create: { id: stream.id, ...fields },
        update: fields,
      });
    });
  }
}
