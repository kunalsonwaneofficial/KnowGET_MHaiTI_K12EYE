import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  RouteDirection,
  SubscriptionStatus,
  TransportSubscription,
  TransportSubscriptionRepository,
} from "@knowget/transport";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface TransportSubscriptionRow {
  id: string;
  tenantId: string;
  organizationId: string;
  studentId: string;
  routeId: string;
  pickupStopKey: string;
  dropStopKey: string;
  direction: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: TransportSubscriptionRow): TransportSubscription {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    studentId: row.studentId as Uuid,
    routeId: row.routeId as Uuid,
    pickupStopKey: row.pickupStopKey,
    dropStopKey: row.dropStopKey,
    direction: row.direction as RouteDirection,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    status: row.status as SubscriptionStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(subscription: TransportSubscription) {
  return {
    tenantId: subscription.tenantId,
    organizationId: subscription.organizationId,
    studentId: subscription.studentId,
    routeId: subscription.routeId,
    pickupStopKey: subscription.pickupStopKey,
    dropStopKey: subscription.dropStopKey,
    direction: subscription.direction,
    effectiveFrom: subscription.effectiveFrom,
    effectiveTo: subscription.effectiveTo,
    status: subscription.status,
  };
}

/** Prisma-backed {@link TransportSubscriptionRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaTransportSubscriptionRepository implements TransportSubscriptionRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<TransportSubscription | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.transportSubscription.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findOpenByStudentAndRoute(
    tenantId: TenantId,
    studentId: Uuid,
    routeId: Uuid,
  ): Promise<TransportSubscription | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.transportSubscription.findFirst({
        where: { studentId, routeId, status: { not: "ended" }, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<TransportSubscription[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.transportSubscription.findMany({
        where: { studentId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByRoute(tenantId: TenantId, routeId: Uuid): Promise<TransportSubscription[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.transportSubscription.findMany({ where: { routeId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listActiveByRoute(tenantId: TenantId, routeId: Uuid): Promise<TransportSubscription[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.transportSubscription.findMany({
        where: { routeId, status: "active", deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<TransportSubscription[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.transportSubscription.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<TransportSubscription[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.transportSubscription.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(subscription: TransportSubscription): Promise<void> {
    return withTenant(this.db, subscription.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(subscription);
      await tx.transportSubscription.upsert({
        where: { id: subscription.id },
        create: { id: subscription.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.transportSubscription.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
