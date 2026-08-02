import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type DeadLetter,
  type DeadLetterReason,
  type DeadLetterRepository,
  type DeadLetterStatus,
} from "@knowget/event-mesh";
import { parseIso, toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface DeadLetterRow {
  id: string;
  tenantId: string;
  organizationId: string;
  subscriptionId: string;
  subscriptionKey: string;
  streamKey: string;
  messageId: string;
  eventId: string;
  eventTypeKey: string;
  partition: number;
  sequence: number;
  reason: string;
  attempts: number;
  traceId: string;
  failedAt: string;
  status: string;
  settledAt: string | null;
  settledBy: string | null;
  discardReason: string | null;
  replayId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Re-render an instant in the fixed-width form `toISOString` produces.
 *
 * `failedAt` is the column both worklist reads are ordered by, and it holds an ISO instant as text, so that
 * ordering is lexical rather than chronological. Fixed-width ISO orders lexically exactly as it orders in time —
 * but the platform's ISO type also admits the second-precision form, and `…T10:00:00.000Z` sorts *before*
 * `…T10:00:00Z` while naming the same moment, because `.` precedes `Z`. Normalizing on write makes the stored
 * alphabet uniform, which is what lets the ordering be taken from the index rather than redone in this process.
 *
 * That is worth being precise about, because the key-ordered reads elsewhere in this domain do the opposite and
 * sort in memory. The difference is where the punctuation sits. A stream key's dots and hyphens fall wherever the
 * name puts them, so a collation that gives punctuation variable weight orders two keys differently from the
 * port's comparator. Every fixed-width instant has its punctuation in the same positions, so stripping or
 * reweighting it leaves the same digits being compared in the same places, and every collation agrees.
 *
 * `settledAt` is stored as the aggregate rendered it, because nothing orders or filters on it.
 */
const fixedWidth = (instant: ISODateString): ISODateString => toIso(parseIso(instant));

function toDomain(row: DeadLetterRow): DeadLetter {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    subscriptionId: row.subscriptionId as Uuid,
    subscriptionKey: row.subscriptionKey,
    streamKey: row.streamKey,
    messageId: row.messageId as Uuid,
    eventId: row.eventId as Uuid,
    eventTypeKey: row.eventTypeKey,
    partition: row.partition,
    sequence: row.sequence,
    reason: row.reason as DeadLetterReason,
    attempts: row.attempts,
    traceId: row.traceId,
    failedAt: row.failedAt as ISODateString,
    status: row.status as DeadLetterStatus,
    settledAt: (row.settledAt as ISODateString | null) ?? null,
    settledBy: (row.settledBy as Uuid | null) ?? null,
    discardReason: row.discardReason,
    replayId: (row.replayId as Uuid | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(letter: DeadLetter) {
  return {
    tenantId: letter.tenantId,
    organizationId: letter.organizationId,
    subscriptionId: letter.subscriptionId,
    subscriptionKey: letter.subscriptionKey,
    streamKey: letter.streamKey,
    messageId: letter.messageId,
    eventId: letter.eventId,
    eventTypeKey: letter.eventTypeKey,
    partition: letter.partition,
    sequence: letter.sequence,
    reason: letter.reason,
    attempts: letter.attempts,
    traceId: letter.traceId,
    failedAt: fixedWidth(letter.failedAt),
    status: letter.status,
    settledAt: letter.settledAt,
    settledBy: letter.settledBy,
    discardReason: letter.discardReason,
    replayId: letter.replayId,
  };
}

/**
 * Prisma-backed {@link DeadLetterRepository} (RLS via {@link withTenant}).
 *
 * `findByMessage` is a `findFirst` because the uniqueness it backs is conditional and Prisma has no way to say
 * so. One message dead-letters once per subscription *while the record is open*; a message that failed, was
 * settled and failed again is two rows rather than one overwritten one, because the second failure is a new fact
 * and overwriting the first would erase the evidence that the consumer had already been broken once. The
 * migration carries that as a partial unique index on the open rows, which is a constraint the database enforces
 * and the schema file can only describe in a comment.
 *
 * Both list reads take their order from the index on organization, status and `failedAt` rather than sorting in
 * this process, which the write-side normalization above is what makes safe. That index exists for exactly this
 * pair of reads: `listOpen` is somebody's morning check and wants the oldest stuck thing first, because the
 * oldest stuck thing is the one that has been failing longest without anybody deciding about it.
 *
 * `listOpen` is organization-wide and `listBySubscription` is not filtered by status, and the asymmetry is the
 * point. Open letters are work and settled ones are evidence, so the worklist excludes what has been decided and
 * the per-consumer history keeps everything. Without the second read, somebody discarding each failure as it
 * arrives makes the queue look clean and the consumer look healthy, and the question *has this been failing
 * quietly for a month* has nowhere to be asked.
 *
 * There is no `remove`, and on this table that matters more than most. A dead letter is the record that the mesh
 * accepted a fact and a consumer never acted on it; deleting one does not undo the second half of that sentence,
 * it only removes the place where anybody could have found out.
 */
export class PrismaDeadLetterRepository implements DeadLetterRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<DeadLetter | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.deadLetter.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /**
   * The latest record for one message on one consumer — how a restart loop stays one row rather than a thousand.
   *
   * Ordered newest failure first, and the ordering is load-bearing rather than cosmetic. A message that failed,
   * was settled and failed again holds two rows here, and the caller above decides what to do by asking whether
   * what it gets back is still open. Handing it the settled first failure would read as *nothing is open*, a
   * second open row would be written for a message that already has one, and the partial unique index would
   * refuse the insert — a delivery loop failing on a constraint instead of recording that it failed. The newest
   * row is the open one whenever one exists, because a fresh row is only ever opened when none was.
   */
  findByMessage(
    tenantId: TenantId,
    subscriptionId: Uuid,
    messageId: Uuid,
  ): Promise<DeadLetter | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.deadLetter.findFirst({
        where: { subscriptionId, messageId },
        orderBy: { failedAt: "desc" },
      });
      return row ? toDomain(row) : null;
    });
  }

  /** Everything currently stuck across one institution, oldest first — the shape the question is asked in. */
  listOpen(tenantId: TenantId, organizationId: Uuid): Promise<DeadLetter[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.deadLetter.findMany({
        where: { organizationId, status: "open" },
        orderBy: { failedAt: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  /** One consumer's whole failure history, settled rows included, because that is what evidence means. */
  listBySubscription(tenantId: TenantId, subscriptionId: Uuid): Promise<DeadLetter[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.deadLetter.findMany({
        where: { subscriptionId },
        orderBy: { failedAt: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<DeadLetter[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.deadLetter.findMany({
        orderBy: [{ subscriptionKey: "asc" }, { failedAt: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  save(letter: DeadLetter): Promise<void> {
    return withTenant(this.db, letter.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(letter);
      await tx.deadLetter.upsert({
        where: { id: letter.id },
        create: { id: letter.id, ...fields },
        update: fields,
      });
    });
  }
}
