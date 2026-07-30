import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type HttpMethod,
  type IdempotencyRecord,
  type IdempotencyRecordRepository,
  type IdempotencyState,
} from "@knowget/gateway";
import { parseIso, toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface IdempotencyRecordRow {
  id: string;
  tenantId: string;
  organizationId: string;
  consumerId: string;
  idempotencyKey: string;
  capabilityKey: string;
  method: string;
  payloadFingerprint: string;
  state: string;
  recordedStatus: number | null;
  responseRef: string | null;
  completedAt: string | null;
  conflictedAt: string | null;
  expiresAt: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Re-render an instant in the fixed-width form `toISOString` produces.
 *
 * `expiresAt` is the only column in this table compared with an inequality, it holds an ISO instant as a
 * `String`, and so that comparison is lexical. Fixed-width ISO orders lexically exactly as it orders in time, but
 * the platform's ISO type also admits the second-precision form, and `…T10:00:00.000Z` sorts *before*
 * `…T10:00:00Z` while naming the same moment, because `.` precedes `Z`. The sweep's instant arrives from a caller
 * and so may be written either way, which is reason enough to put the bound through this on the way in. The column
 * is put through it on the way out for a different reason: every site in the aggregate that stamps an expiry today
 * renders it through `toISOString`, so the stored side is already fixed-width — but the column's lexical order
 * being its chronological order is an obligation of the comparison performed here, not a property this adapter may
 * inherit from a formatter chosen on the other side of a package boundary.
 */
const fixedWidth = (instant: ISODateString): ISODateString => toIso(parseIso(instant));

function toDomain(row: IdempotencyRecordRow): IdempotencyRecord {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    consumerId: row.consumerId as Uuid,
    idempotencyKey: row.idempotencyKey,
    capabilityKey: row.capabilityKey,
    method: row.method as HttpMethod,
    payloadFingerprint: row.payloadFingerprint,
    state: row.state as IdempotencyState,
    recordedStatus: row.recordedStatus,
    responseRef: row.responseRef,
    completedAt: (row.completedAt as ISODateString | null) ?? null,
    conflictedAt: (row.conflictedAt as ISODateString | null) ?? null,
    expiresAt: row.expiresAt as ISODateString,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(record: IdempotencyRecord) {
  return {
    tenantId: record.tenantId,
    organizationId: record.organizationId,
    consumerId: record.consumerId,
    idempotencyKey: record.idempotencyKey,
    capabilityKey: record.capabilityKey,
    method: record.method,
    payloadFingerprint: record.payloadFingerprint,
    state: record.state,
    recordedStatus: record.recordedStatus,
    responseRef: record.responseRef,
    completedAt: record.completedAt,
    conflictedAt: record.conflictedAt,
    expiresAt: fixedWidth(record.expiresAt),
  };
}

/**
 * Prisma-backed {@link IdempotencyRecordRepository} (RLS via {@link withTenant}).
 *
 * This is the one table in the gateway a row leaves. Everywhere else a retired thing keeps its row because the
 * row is the explanation of something a person will ask about later; here the row is a receipt for a request whose
 * caller has long since moved on, one arrives per guarded write, and the ledger would otherwise grow without
 * bound for as long as the platform runs. The module the sweep serves is explicit that expiry is *read* rather
 * than enforced — a record past its retention is treated as absent by the ledger itself, and the verdict for an
 * expired lookup differs from the verdict for an empty one — so the delete removes only rows that had already
 * stopped answering. That is what makes it safe for the sweep to run late, or twice, or not at all for a week.
 *
 * `purgeExpired` reads its bound as an argument and returns Prisma's count, which is the count the port asks for:
 * a sweep that cannot say how much it removed is a sweep nobody can tell has stopped working. It carries no state
 * filter, exactly like the pure predicate it mirrors — an operation that went in flight and never came back is
 * the most expired thing in the table, and excluding it would leave the one class of row that never settles as
 * the one class of row that never leaves.
 *
 * `findByKey` carries the consumer because a key is unique within a consumer and never across the tenant. Two
 * integrators independently numbering their requests from one is the normal case, and a tenant-wide key lookup
 * would turn it into one integrator replaying the other's response.
 *
 * There is no `listByTenant`, and the absence is the port's rather than an oversight: this ledger takes a row per
 * guarded write, and a read that materialises all of them is not a report but an outage waiting for the tenant
 * that grows large enough to trigger it. `listByConsumer` answers the question anybody actually brings — what has
 * this integration been doing — and is bounded by something.
 */
export class PrismaIdempotencyRecordRepository implements IdempotencyRecordRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<IdempotencyRecord | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.idempotencyRecord.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /** The lookup every guarded write begins with — one record per key per consumer. */
  findByKey(
    tenantId: TenantId,
    consumerId: Uuid,
    idempotencyKey: string,
  ): Promise<IdempotencyRecord | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.idempotencyRecord.findFirst({
        where: { consumerId, idempotencyKey },
      });
      return row ? toDomain(row) : null;
    });
  }

  /** What one integrator has spent its keys on, oldest first. */
  listByConsumer(tenantId: TenantId, consumerId: Uuid): Promise<IdempotencyRecord[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.idempotencyRecord.findMany({
        where: { consumerId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  /**
   * Remove every record that had stopped being honoured as of one instant, and say how many.
   *
   * The instant is an argument rather than a clock reading, so a sweep decides the whole batch against one
   * moment: a record expiring on the boundary is either in this run or the next one, never in both and never in
   * neither.
   */
  purgeExpired(tenantId: TenantId, asOf: ISODateString): Promise<number> {
    const bound = fixedWidth(asOf);
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const result = await tx.idempotencyRecord.deleteMany({
        where: { expiresAt: { lte: bound } },
      });
      return result.count;
    });
  }

  save(record: IdempotencyRecord): Promise<void> {
    return withTenant(this.db, record.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(record);
      await tx.idempotencyRecord.upsert({
        where: { id: record.id },
        create: { id: record.id, ...fields },
        update: fields,
      });
    });
  }
}
