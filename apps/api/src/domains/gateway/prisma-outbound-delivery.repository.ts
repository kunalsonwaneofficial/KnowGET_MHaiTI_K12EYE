import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type DeliveryMode,
  type DeliveryOutcome,
  MAX_DELIVERY_ATTEMPTS,
  type OutboundDelivery,
  type OutboundDeliveryRepository,
} from "@knowget/gateway";
import { parseIso, toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface OutboundDeliveryRow {
  id: string;
  tenantId: string;
  organizationId: string;
  subscriptionId: string;
  endpointId: string;
  eventType: string;
  eventId: string;
  payloadFingerprint: string;
  deliveryMode: string;
  outcome: string;
  attempts: number;
  nextAttemptAt: string | null;
  lastAttemptedAt: string | null;
  lastStatusCode: number | null;
  lastError: string | null;
  deliveredAt: string | null;
  deadLetteredAt: string | null;
  abandonedAt: string | null;
  abandonedReason: string | null;
  replayOfDeliveryId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Re-render an instant in the fixed-width form `toISOString` produces.
 *
 * `nextAttemptAt` is the one column in this domain compared with an inequality, and it is a `String` holding an
 * ISO instant, so that comparison is lexical. Fixed-width ISO orders lexically exactly as it orders in time — but
 * the platform's ISO type also admits the second-precision form, and `…T10:00:00.000Z` sorts *before*
 * `…T10:00:00Z` while naming the same moment, because `.` precedes `Z`. Both sides of the comparison are put
 * through this function so the column's lexical order is its chronological order and the bound is expressed in the
 * same alphabet. Every other instant in this file is stored exactly as the aggregate produced it, because nothing
 * compares those with an inequality — an obligation that arrives with the next range filter somebody adds, not
 * one this adapter can discharge on their behalf.
 */
const fixedWidth = (instant: ISODateString): ISODateString => toIso(parseIso(instant));

function toDomain(row: OutboundDeliveryRow): OutboundDelivery {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    subscriptionId: row.subscriptionId as Uuid,
    endpointId: row.endpointId as Uuid,
    eventType: row.eventType,
    eventId: row.eventId as Uuid,
    payloadFingerprint: row.payloadFingerprint,
    deliveryMode: row.deliveryMode as DeliveryMode,
    outcome: row.outcome as DeliveryOutcome,
    attempts: row.attempts,
    nextAttemptAt: (row.nextAttemptAt as ISODateString | null) ?? null,
    lastAttemptedAt: (row.lastAttemptedAt as ISODateString | null) ?? null,
    lastStatusCode: row.lastStatusCode,
    lastError: row.lastError,
    deliveredAt: (row.deliveredAt as ISODateString | null) ?? null,
    deadLetteredAt: (row.deadLetteredAt as ISODateString | null) ?? null,
    abandonedAt: (row.abandonedAt as ISODateString | null) ?? null,
    abandonedReason: row.abandonedReason,
    replayOfDeliveryId: (row.replayOfDeliveryId as Uuid | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(delivery: OutboundDelivery) {
  return {
    tenantId: delivery.tenantId,
    organizationId: delivery.organizationId,
    subscriptionId: delivery.subscriptionId,
    endpointId: delivery.endpointId,
    eventType: delivery.eventType,
    eventId: delivery.eventId,
    payloadFingerprint: delivery.payloadFingerprint,
    deliveryMode: delivery.deliveryMode,
    outcome: delivery.outcome,
    attempts: delivery.attempts,
    nextAttemptAt: delivery.nextAttemptAt === null ? null : fixedWidth(delivery.nextAttemptAt),
    lastAttemptedAt: delivery.lastAttemptedAt,
    lastStatusCode: delivery.lastStatusCode,
    lastError: delivery.lastError,
    deliveredAt: delivery.deliveredAt,
    deadLetteredAt: delivery.deadLetteredAt,
    abandonedAt: delivery.abandonedAt,
    abandonedReason: delivery.abandonedReason,
    replayOfDeliveryId: delivery.replayOfDeliveryId,
  };
}

/**
 * Prisma-backed {@link OutboundDeliveryRepository} (RLS via {@link withTenant}).
 *
 * `listDue` is the dispatcher's worklist and it reproduces the pure due-ness predicate clause for clause: not
 * settled, scheduled, not yet at the attempt ceiling, and scheduled at or before the sweep's instant. The
 * unsettled outcomes are named rather than negated because the terminal set is closed and small, and `IN` over
 * two values is a clause a reader can check against the predicate by eye. The attempt ceiling is imported rather
 * than written as a number, so a change to the schedule cannot leave a worklist that keeps handing back
 * deliveries the aggregate will refuse to attempt.
 *
 * `findBySubscriptionAndEvent` excludes replays, which is what keeps at-most-once meaning anything. A replay is a
 * deliberate second delivery of the same event with a record of who asked for it, so it must not be the row that
 * answers *has this event already been sent here* — otherwise the first replay would make the original invisible
 * to the guard that exists to prevent duplicates.
 *
 * Ordering is done on `createdAt`, which is a real timestamp column, and never on one of the ISO string columns.
 * A `DateTime` cannot be ordered wrongly by how wide somebody wrote it.
 *
 * There is no `remove`. A delivery ledger that can be pruned is a delivery ledger that cannot answer the only
 * question anybody brings to it, which is what this platform sent to whom and when it stopped trying.
 */
export class PrismaOutboundDeliveryRepository implements OutboundDeliveryRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<OutboundDelivery | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.outboundDelivery.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /** The original delivery of this event to this subscription, if there was one. Replays do not answer. */
  findBySubscriptionAndEvent(
    tenantId: TenantId,
    subscriptionId: Uuid,
    eventId: Uuid,
  ): Promise<OutboundDelivery | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.outboundDelivery.findFirst({
        where: { subscriptionId, eventId, replayOfDeliveryId: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  /**
   * Everything the dispatcher may attempt as of one instant, oldest first.
   *
   * The instant is an argument and not a clock reading, so every candidate in a sweep is judged against the same
   * moment: a delivery scheduled for the boundary falls on one side of it for the whole batch rather than on
   * whichever side the clock had reached when its row came up.
   */
  listDue(tenantId: TenantId, asOf: ISODateString): Promise<OutboundDelivery[]> {
    const bound = fixedWidth(asOf);
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.outboundDelivery.findMany({
        where: {
          outcome: { in: ["pending", "failed"] },
          nextAttemptAt: { not: null, lte: bound },
          attempts: { lt: MAX_DELIVERY_ATTEMPTS },
        },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  /** One subscription's delivery history in the order it happened. */
  listBySubscription(tenantId: TenantId, subscriptionId: Uuid): Promise<OutboundDelivery[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.outboundDelivery.findMany({
        where: { subscriptionId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  /**
   * The replay worklist — every delivery the platform admitted it could not get through.
   *
   * No settled test appears alongside the outcome because a dead letter is terminal by definition. A dead letter
   * queue nobody can list is a deletion with extra steps.
   */
  listDeadLettered(tenantId: TenantId, organizationId: Uuid): Promise<OutboundDelivery[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.outboundDelivery.findMany({
        where: { organizationId, outcome: "dead_lettered" },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<OutboundDelivery[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.outboundDelivery.findMany({ orderBy: { createdAt: "asc" } });
      return rows.map(toDomain);
    });
  }

  save(delivery: OutboundDelivery): Promise<void> {
    return withTenant(this.db, delivery.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(delivery);
      await tx.outboundDelivery.upsert({
        where: { id: delivery.id },
        create: { id: delivery.id, ...fields },
        update: fields,
      });
    });
  }
}
