import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type DeliverySemantics,
  type FilterPredicate,
  type MeshSubscription,
  type MeshSubscriptionRepository,
  type SubscriptionStatus,
  compareText,
} from "@knowget/event-mesh";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface MeshSubscriptionRow {
  id: string;
  tenantId: string;
  organizationId: string;
  subscriptionKey: string;
  streamKey: string;
  consumerGroup: string;
  title: string;
  semantics: string;
  maxAttempts: number;
  filter: unknown;
  status: string;
  activatedAt: string | null;
  activatedBy: string | null;
  pausedAt: string | null;
  retiredAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: MeshSubscriptionRow): MeshSubscription {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    subscriptionKey: row.subscriptionKey,
    streamKey: row.streamKey,
    consumerGroup: row.consumerGroup,
    title: row.title,
    semantics: row.semantics as DeliverySemantics,
    maxAttempts: row.maxAttempts,
    filter: (row.filter as FilterPredicate[]) ?? [],
    status: row.status as SubscriptionStatus,
    activatedAt: (row.activatedAt as ISODateString | null) ?? null,
    activatedBy: (row.activatedBy as Uuid | null) ?? null,
    pausedAt: (row.pausedAt as ISODateString | null) ?? null,
    retiredAt: (row.retiredAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(subscription: MeshSubscription) {
  return {
    tenantId: subscription.tenantId,
    organizationId: subscription.organizationId,
    subscriptionKey: subscription.subscriptionKey,
    streamKey: subscription.streamKey,
    consumerGroup: subscription.consumerGroup,
    title: subscription.title,
    semantics: subscription.semantics,
    maxAttempts: subscription.maxAttempts,
    filter: JSON.parse(JSON.stringify(subscription.filter)),
    status: subscription.status,
    activatedAt: subscription.activatedAt,
    activatedBy: subscription.activatedBy,
    pausedAt: subscription.pausedAt,
    retiredAt: subscription.retiredAt,
  };
}

/** The port's documented order for both per-stream reads: code-point ascending, exactly as in memory. */
function bySubscriptionKey(left: MeshSubscription, right: MeshSubscription): number {
  return compareText(left.subscriptionKey, right.subscriptionKey);
}

/**
 * Prisma-backed {@link MeshSubscriptionRepository} (RLS via {@link withTenant}).
 *
 * The filter is JSONB and it is deliberately not searchable. Nothing asks which subscriptions filter on a given
 * attribute; what the routing engine asks is *what does this subscription filter on*, one row at a time, with
 * the predicates in the order they were declared because a filter is evaluated as an ordered conjunction. JSONB
 * preserves that order for free, and the alternative — a predicate table with a sequence column — would make an
 * ordered whole editable a row at a time by anything holding a connection.
 *
 * There is a second reason the column stays opaque here. A filter's `values` are institutional data: a
 * subscription filtering on a grade, a campus or a student category is describing part of a school's structure,
 * and it is the reason the package refuses to put filter values on the domain events it raises. Making them
 * queryable at this layer would put them back within reach of anything that can write a `WHERE`, having gone to
 * the trouble of keeping them off the bus.
 *
 * Both per-stream reads are sorted in this process against the comparator the port documents, for the reason the
 * stream repository sorts its reverse lookup: a subscription key carries dots and hyphens, and a collation that
 * gives those variable weight would order them differently from the contract while every in-memory test still
 * passed. `listDeliverable` is the routing candidate set, so its order is the order deliveries are attempted in
 * — a detail that shows up in a dead-letter trail long after anybody would think to check it.
 *
 * `listDeliverable` spells out `active`. `registered` has never been switched on, `paused` was switched off on
 * purpose, and `retired` is a record; each of the three is a consumer that must not be handed a message, and
 * they are three different reasons rather than one.
 *
 * There is no `remove`. The port is explicit about the cost: positions are held against a subscription, so a
 * reissued key hands a new consumer the committed positions of a dead one, and it starts life believing it has
 * already processed a month it has never seen.
 */
export class PrismaMeshSubscriptionRepository implements MeshSubscriptionRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<MeshSubscription | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.meshSubscription.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /** The one-subscription-per-key rule, retired subscriptions included — their keys stay taken. */
  findByKey(tenantId: TenantId, subscriptionKey: string): Promise<MeshSubscription | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.meshSubscription.findFirst({ where: { subscriptionKey } });
      return row ? toDomain(row) : null;
    });
  }

  /** Every consumer on one stream, whatever state it is in — what makes a stream's lifecycle enforceable. */
  listByStream(tenantId: TenantId, streamKey: string): Promise<MeshSubscription[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.meshSubscription.findMany({ where: { streamKey } });
      return rows.map(toDomain).sort(bySubscriptionKey);
    });
  }

  /** The routing candidate set for one stream: who may actually be handed a message on it. */
  listDeliverable(tenantId: TenantId, streamKey: string): Promise<MeshSubscription[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.meshSubscription.findMany({
        where: { streamKey, status: "active" },
      });
      return rows.map(toDomain).sort(bySubscriptionKey);
    });
  }

  listByTenant(tenantId: TenantId): Promise<MeshSubscription[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.meshSubscription.findMany({
        orderBy: [{ streamKey: "asc" }, { subscriptionKey: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  save(subscription: MeshSubscription): Promise<void> {
    return withTenant(this.db, subscription.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(subscription);
      await tx.meshSubscription.upsert({
        where: { id: subscription.id },
        create: { id: subscription.id, ...fields },
        update: fields,
      });
    });
  }
}
