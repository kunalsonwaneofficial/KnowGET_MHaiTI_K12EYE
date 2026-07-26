import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { FacilityProfile, FacilityProfileRepository } from "@knowget/facilities";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface FacilityProfileRow {
  id: string;
  tenantId: string;
  organizationId: string;
  buildingId: string;
  buildingCode: string;
  buildingName: string;
  buildingStatus: string;
  spaceCount: number;
  availableSpaceCount: number;
  outOfServiceSpaceCount: number;
  totalCapacity: number;
  availableCapacity: number;
  systemCount: number;
  operationalSystemCount: number;
  systemsUnderMaintenance: number;
  readinessPercent: number;
  openMaintenanceCount: number;
  refreshedAt: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: FacilityProfileRow): FacilityProfile {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    buildingId: row.buildingId as Uuid,
    buildingCode: row.buildingCode,
    buildingName: row.buildingName,
    buildingStatus: row.buildingStatus,
    spaceCount: row.spaceCount,
    availableSpaceCount: row.availableSpaceCount,
    outOfServiceSpaceCount: row.outOfServiceSpaceCount,
    totalCapacity: row.totalCapacity,
    availableCapacity: row.availableCapacity,
    systemCount: row.systemCount,
    operationalSystemCount: row.operationalSystemCount,
    systemsUnderMaintenance: row.systemsUnderMaintenance,
    readinessPercent: row.readinessPercent,
    openMaintenanceCount: row.openMaintenanceCount,
    refreshedAt: row.refreshedAt,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(profile: FacilityProfile) {
  return {
    tenantId: profile.tenantId,
    organizationId: profile.organizationId,
    buildingId: profile.buildingId,
    buildingCode: profile.buildingCode,
    buildingName: profile.buildingName,
    buildingStatus: profile.buildingStatus,
    spaceCount: profile.spaceCount,
    availableSpaceCount: profile.availableSpaceCount,
    outOfServiceSpaceCount: profile.outOfServiceSpaceCount,
    totalCapacity: profile.totalCapacity,
    availableCapacity: profile.availableCapacity,
    systemCount: profile.systemCount,
    operationalSystemCount: profile.operationalSystemCount,
    systemsUnderMaintenance: profile.systemsUnderMaintenance,
    readinessPercent: profile.readinessPercent,
    openMaintenanceCount: profile.openMaintenanceCount,
    refreshedAt: profile.refreshedAt,
  };
}

/** Prisma-backed {@link FacilityProfileRepository} (RLS via {@link withTenant}; soft delete). One per building. */
export class PrismaFacilityProfileRepository implements FacilityProfileRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<FacilityProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.facilityProfile.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByBuilding(tenantId: TenantId, buildingId: Uuid): Promise<FacilityProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.facilityProfile.findFirst({ where: { buildingId, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<FacilityProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.facilityProfile.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<FacilityProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.facilityProfile.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(profile: FacilityProfile): Promise<void> {
    return withTenant(this.db, profile.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(profile);
      await tx.facilityProfile.upsert({
        where: { id: profile.id },
        create: { id: profile.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.facilityProfile.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
