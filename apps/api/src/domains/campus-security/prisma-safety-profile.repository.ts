import type { SafetyProfile, SafetyProfileRepository } from "@knowget/campus-security";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface SafetyProfileRow {
  id: string;
  tenantId: string;
  organizationId: string;
  zoneId: string;
  zoneCode: string;
  zoneName: string;
  securityLevel: string;
  zoneStatus: string;
  capacity: number;
  onSiteVisitorCount: number;
  available: number;
  overCapacity: boolean;
  occupancyPercent: number;
  openIncidentCount: number;
  activeCredentialCount: number;
  accessGrantedCount: number;
  accessDeniedCount: number;
  refreshedAt: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: SafetyProfileRow): SafetyProfile {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    zoneId: row.zoneId as Uuid,
    zoneCode: row.zoneCode,
    zoneName: row.zoneName,
    securityLevel: row.securityLevel,
    zoneStatus: row.zoneStatus,
    capacity: row.capacity,
    onSiteVisitorCount: row.onSiteVisitorCount,
    available: row.available,
    overCapacity: row.overCapacity,
    occupancyPercent: row.occupancyPercent,
    openIncidentCount: row.openIncidentCount,
    activeCredentialCount: row.activeCredentialCount,
    accessGrantedCount: row.accessGrantedCount,
    accessDeniedCount: row.accessDeniedCount,
    refreshedAt: row.refreshedAt,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(profile: SafetyProfile) {
  return {
    tenantId: profile.tenantId,
    organizationId: profile.organizationId,
    zoneId: profile.zoneId,
    zoneCode: profile.zoneCode,
    zoneName: profile.zoneName,
    securityLevel: profile.securityLevel,
    zoneStatus: profile.zoneStatus,
    capacity: profile.capacity,
    onSiteVisitorCount: profile.onSiteVisitorCount,
    available: profile.available,
    overCapacity: profile.overCapacity,
    occupancyPercent: profile.occupancyPercent,
    openIncidentCount: profile.openIncidentCount,
    activeCredentialCount: profile.activeCredentialCount,
    accessGrantedCount: profile.accessGrantedCount,
    accessDeniedCount: profile.accessDeniedCount,
    refreshedAt: profile.refreshedAt,
  };
}

/** Prisma-backed {@link SafetyProfileRepository} (RLS via {@link withTenant}; soft delete). One per zone. */
export class PrismaSafetyProfileRepository implements SafetyProfileRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<SafetyProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.safetyProfile.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByZone(tenantId: TenantId, zoneId: Uuid): Promise<SafetyProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.safetyProfile.findFirst({ where: { zoneId, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<SafetyProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.safetyProfile.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<SafetyProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.safetyProfile.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(profile: SafetyProfile): Promise<void> {
    return withTenant(this.db, profile.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(profile);
      await tx.safetyProfile.upsert({
        where: { id: profile.id },
        create: { id: profile.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.safetyProfile.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
