import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  RouteUtilizationProfile,
  RouteUtilizationProfileRepository,
} from "@knowget/transport";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface RouteUtilizationProfileRow {
  id: string;
  tenantId: string;
  organizationId: string;
  routeId: string;
  routeCode: string;
  capacity: number;
  subscriberCount: number;
  seatsAvailable: number;
  utilizationPercent: number;
  overCapacity: boolean;
  hasActiveAssignment: boolean;
  version: number;
  refreshedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: RouteUtilizationProfileRow): RouteUtilizationProfile {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    routeId: row.routeId as Uuid,
    routeCode: row.routeCode,
    capacity: row.capacity,
    subscriberCount: row.subscriberCount,
    seatsAvailable: row.seatsAvailable,
    utilizationPercent: row.utilizationPercent,
    overCapacity: row.overCapacity,
    hasActiveAssignment: row.hasActiveAssignment,
    version: row.version,
    refreshedAt: (row.refreshedAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(profile: RouteUtilizationProfile) {
  return {
    tenantId: profile.tenantId,
    organizationId: profile.organizationId,
    routeId: profile.routeId,
    routeCode: profile.routeCode,
    capacity: profile.capacity,
    subscriberCount: profile.subscriberCount,
    seatsAvailable: profile.seatsAvailable,
    utilizationPercent: profile.utilizationPercent,
    overCapacity: profile.overCapacity,
    hasActiveAssignment: profile.hasActiveAssignment,
    version: profile.version,
    refreshedAt: profile.refreshedAt,
  };
}

/** Prisma-backed {@link RouteUtilizationProfileRepository} (one per route; RLS via {@link withTenant}). */
export class PrismaRouteUtilizationProfileRepository implements RouteUtilizationProfileRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<RouteUtilizationProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.routeUtilizationProfile.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByRoute(tenantId: TenantId, routeId: Uuid): Promise<RouteUtilizationProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.routeUtilizationProfile.findFirst({
        where: { routeId, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<RouteUtilizationProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.routeUtilizationProfile.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<RouteUtilizationProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.routeUtilizationProfile.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(profile: RouteUtilizationProfile): Promise<void> {
    return withTenant(this.db, profile.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(profile);
      await tx.routeUtilizationProfile.upsert({
        where: { id: profile.id },
        create: { id: profile.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.routeUtilizationProfile.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
