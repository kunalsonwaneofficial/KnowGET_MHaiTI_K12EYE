import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type DeliveryMode,
  type SubscriptionStatus,
  type WebhookSubscription,
  type WebhookSubscriptionRepository,
  normalizeKey,
} from "@knowget/gateway";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface WebhookSubscriptionRow {
  id: string;
  tenantId: string;
  organizationId: string;
  consumerId: string;
  subscriptionKey: string;
  displayName: string;
  endpointId: string;
  eventTypes: string[];
  deliveryMode: string;
  secretRef: string | null;
  status: string;
  consecutiveFailures: number;
  lastDeliveryAt: string | null;
  lastSuccessAt: string | null;
  pausedAt: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  revokedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: WebhookSubscriptionRow): WebhookSubscription {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    consumerId: row.consumerId as Uuid,
    subscriptionKey: row.subscriptionKey,
    displayName: row.displayName,
    endpointId: row.endpointId as Uuid,
    eventTypes: row.eventTypes,
    deliveryMode: row.deliveryMode as DeliveryMode,
    secretRef: row.secretRef,
    status: row.status as SubscriptionStatus,
    consecutiveFailures: row.consecutiveFailures,
    lastDeliveryAt: (row.lastDeliveryAt as ISODateString | null) ?? null,
    lastSuccessAt: (row.lastSuccessAt as ISODateString | null) ?? null,
    pausedAt: (row.pausedAt as ISODateString | null) ?? null,
    suspendedAt: (row.suspendedAt as ISODateString | null) ?? null,
    suspendedReason: row.suspendedReason,
    revokedAt: (row.revokedAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(subscription: WebhookSubscription) {
  return {
    tenantId: subscription.tenantId,
    organizationId: subscription.organizationId,
    consumerId: subscription.consumerId,
    subscriptionKey: subscription.subscriptionKey,
    displayName: subscription.displayName,
    endpointId: subscription.endpointId,
    eventTypes: [...subscription.eventTypes],
    deliveryMode: subscription.deliveryMode,
    secretRef: subscription.secretRef,
    status: subscription.status,
    consecutiveFailures: subscription.consecutiveFailures,
    lastDeliveryAt: subscription.lastDeliveryAt,
    lastSuccessAt: subscription.lastSuccessAt,
    pausedAt: subscription.pausedAt,
    suspendedAt: subscription.suspendedAt,
    suspendedReason: subscription.suspendedReason,
    revokedAt: subscription.revokedAt,
  };
}

/**
 * Prisma-backed {@link WebhookSubscriptionRepository} (RLS via {@link withTenant}).
 *
 * A subscription key is unique within a consumer and not across the tenant, because two integrators both calling
 * their feed `enrolments` is the normal case rather than a collision. Every lookup by key therefore carries the
 * consumer, and there is no tenant-wide key read for anybody to reach for instead.
 *
 * `listInterestedIn` is the fan-out read and the one place this adapter has to be honest about what the database
 * can do for it. The pure predicate decides interest by asking whether the normalized event type appears in the
 * subscription's list, so this read normalizes the argument the same way before pushing the containment into SQL;
 * if the two normalizations ever diverged, publishing would quietly reach a different set of receivers than the
 * aggregate believes are subscribed. What SQL will *not* do is serve that containment from an index: under forced
 * row-level security the array containment operator is not leakproof, so the planner is obliged to apply it after
 * the security barrier rather than as an index condition, and an index intended for it would never be chosen at
 * any size. That measured result is why the schema carries no such index. The read is a filter over one
 * organization's subscriptions, which is bounded by how many feeds an institution has agreed to send — a number
 * that stays small for the same reason each one is a signed arrangement with somebody.
 *
 * `listByEndpoint` is what makes taking an endpoint out of service an informed act. An endpoint is shared, so
 * disabling one silently stops deliveries for every subscription pointing at it, and whoever is about to do that
 * should be shown what they are stopping.
 *
 * `secretRef` is nullable for the same reason an endpoint's is, and the reasoning is written there.
 *
 * There is no `remove`. A revoked subscription is the record of what was being sent where, which is the first
 * thing anybody wants when a receiver asks why they stopped getting events — or why they ever got them.
 */
export class PrismaWebhookSubscriptionRepository implements WebhookSubscriptionRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<WebhookSubscription | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.webhookSubscription.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /** The key lookup behind one subscription per key per consumer. */
  findByKey(
    tenantId: TenantId,
    consumerId: Uuid,
    subscriptionKey: string,
  ): Promise<WebhookSubscription | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.webhookSubscription.findFirst({
        where: { consumerId, subscriptionKey },
      });
      return row ? toDomain(row) : null;
    });
  }

  /** Everything one integrator has arranged to receive, whatever state each arrangement is in. */
  listByConsumer(tenantId: TenantId, consumerId: Uuid): Promise<WebhookSubscription[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.webhookSubscription.findMany({
        where: { consumerId },
        orderBy: { subscriptionKey: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  /** Who is depending on this endpoint — the read behind every decision to disable one. */
  listByEndpoint(tenantId: TenantId, endpointId: Uuid): Promise<WebhookSubscription[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.webhookSubscription.findMany({
        where: { endpointId },
        orderBy: [{ consumerId: "asc" }, { subscriptionKey: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  /**
   * The subscriptions that are both being sent to and subscribed to this event type.
   *
   * Paused, suspended and revoked subscriptions are excluded here rather than skipped by the dispatcher, so
   * pausing a feed is a fact about the record instead of a behaviour of whoever remembered to check.
   */
  listInterestedIn(
    tenantId: TenantId,
    organizationId: Uuid,
    eventType: string,
  ): Promise<WebhookSubscription[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.webhookSubscription.findMany({
        where: {
          organizationId,
          status: "active",
          eventTypes: { has: normalizeKey(eventType) },
        },
        orderBy: [{ consumerId: "asc" }, { subscriptionKey: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<WebhookSubscription[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.webhookSubscription.findMany({
        orderBy: [{ consumerId: "asc" }, { subscriptionKey: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  save(subscription: WebhookSubscription): Promise<void> {
    return withTenant(this.db, subscription.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(subscription);
      await tx.webhookSubscription.upsert({
        where: { id: subscription.id },
        create: { id: subscription.id, ...fields },
        update: fields,
      });
    });
  }
}
