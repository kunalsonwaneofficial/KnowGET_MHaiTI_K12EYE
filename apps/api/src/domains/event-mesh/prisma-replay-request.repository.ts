import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type ReplayRequest,
  type ReplayRequestRepository,
  type ReplayStatus,
} from "@knowget/event-mesh";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface ReplayRequestRow {
  id: string;
  tenantId: string;
  organizationId: string;
  subscriptionId: string;
  subscriptionKey: string;
  streamKey: string;
  fromInstant: string;
  toInstant: string;
  reason: string;
  status: string;
  requestedBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  messageCount: number | null;
  startedAt: string | null;
  settledAt: string | null;
  settledBy: string | null;
  settlementReason: string | null;
  deliveredCount: number | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ReplayRequestRow): ReplayRequest {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    subscriptionId: row.subscriptionId as Uuid,
    subscriptionKey: row.subscriptionKey,
    streamKey: row.streamKey,
    fromInstant: row.fromInstant as ISODateString,
    toInstant: row.toInstant as ISODateString,
    reason: row.reason,
    status: row.status as ReplayStatus,
    requestedBy: row.requestedBy as Uuid,
    approvedBy: (row.approvedBy as Uuid | null) ?? null,
    approvedAt: (row.approvedAt as ISODateString | null) ?? null,
    messageCount: row.messageCount,
    startedAt: (row.startedAt as ISODateString | null) ?? null,
    settledAt: (row.settledAt as ISODateString | null) ?? null,
    settledBy: (row.settledBy as Uuid | null) ?? null,
    settlementReason: row.settlementReason,
    deliveredCount: row.deliveredCount,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(request: ReplayRequest) {
  return {
    tenantId: request.tenantId,
    organizationId: request.organizationId,
    subscriptionId: request.subscriptionId,
    subscriptionKey: request.subscriptionKey,
    streamKey: request.streamKey,
    fromInstant: request.fromInstant,
    toInstant: request.toInstant,
    reason: request.reason,
    status: request.status,
    requestedBy: request.requestedBy,
    approvedBy: request.approvedBy,
    approvedAt: request.approvedAt,
    messageCount: request.messageCount,
    startedAt: request.startedAt,
    settledAt: request.settledAt,
    settledBy: request.settledBy,
    settlementReason: request.settlementReason,
    deliveredCount: request.deliveredCount,
  };
}

/**
 * Prisma-backed {@link ReplayRequestRepository} (RLS via {@link withTenant}).
 *
 * `findRunning` is a `findFirst` over the status because the uniqueness it backs is conditional: one subscription
 * replays one window at a time, every other status may repeat freely, and a consumer may hold a hundred completed
 * replays and one that was merely requested. Prisma has no way to express a unique index with a `WHERE`, so the
 * constraint lives in the migration as a partial unique index and the schema file can only describe it in a
 * comment — which is the same arrangement the dead-letter table uses, and for the same reason.
 *
 * What that constraint prevents is worth restating where the read is implemented. Two replays running into one
 * consumer group interleave two ranges of history in an order neither requester asked for, and the consumer on
 * the far side was written to read a stream forwards. It cannot tell that it is being handed two, so the damage
 * is not an error anybody sees; it is a projection that ends up in a state no sequence of real events could have
 * produced. Refusing the second request is the only place that can be stopped, and this read is what lets it be
 * refused.
 *
 * `listBySubscription` orders on `created_at`, which is a real `timestamptz` rather than one of this domain's
 * stored ISO strings, so the database's ordering and the port's `compareText` on the rendered instant are the
 * same ordering — a fixed-width ISO rendering is monotonic in the instant it renders. Chronological is also the
 * order this read is actually read in: it is the answer to *why does this projection show the same enrolment
 * twice*, and that question is answered by walking forwards from the last time the projection was known good.
 *
 * `fromInstant` and `toInstant` are stored exactly as the requester stated them. They bound a window, but the
 * comparison happens against `mesh_message.recorded_at` in the message adapter, which normalizes both ends of its
 * own bound; normalizing them a second time here would put a second opinion about instant formatting into the
 * path, and the one that matters is the one applied where the inequality is evaluated.
 *
 * There is no `remove`. A settled replay is the record that somebody asked for a range of history to be delivered
 * again, who approved it and how much actually went. Deleting one leaves the re-delivered facts in place and
 * removes the only account of why they are there, which turns a documented operation into an unexplained
 * duplicate somebody will eventually try to fix by hand.
 */
export class PrismaReplayRequestRepository implements ReplayRequestRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<ReplayRequest | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.replayRequest.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /** The one replay currently in flight for a consumer, which is how a second one is refused. */
  findRunning(tenantId: TenantId, subscriptionId: Uuid): Promise<ReplayRequest | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.replayRequest.findFirst({
        where: { subscriptionId, status: "running" },
      });
      return row ? toDomain(row) : null;
    });
  }

  /** One consumer's replay history, oldest first — what an investigation into duplicated work walks. */
  listBySubscription(tenantId: TenantId, subscriptionId: Uuid): Promise<ReplayRequest[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.replayRequest.findMany({
        where: { subscriptionId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<ReplayRequest[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.replayRequest.findMany({
        orderBy: [{ subscriptionKey: "asc" }, { createdAt: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  save(request: ReplayRequest): Promise<void> {
    return withTenant(this.db, request.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(request);
      await tx.replayRequest.upsert({
        where: { id: request.id },
        create: { id: request.id, ...fields },
        update: fields,
      });
    });
  }
}
