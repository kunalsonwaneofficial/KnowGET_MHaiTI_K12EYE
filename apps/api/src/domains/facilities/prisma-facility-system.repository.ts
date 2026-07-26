import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  FacilitySystem,
  FacilitySystemRepository,
  SystemStatus,
  SystemType,
} from "@knowget/facilities";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface FacilitySystemRow {
  id: string;
  tenantId: string;
  organizationId: string;
  buildingId: string;
  code: string;
  type: string;
  commissionedOn: string;
  serviceIntervalDays: number;
  lastServicedOn: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: FacilitySystemRow): FacilitySystem {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    buildingId: row.buildingId as Uuid,
    code: row.code,
    type: row.type as SystemType,
    commissionedOn: row.commissionedOn,
    serviceIntervalDays: row.serviceIntervalDays,
    lastServicedOn: row.lastServicedOn,
    status: row.status as SystemStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(system: FacilitySystem) {
  return {
    tenantId: system.tenantId,
    organizationId: system.organizationId,
    buildingId: system.buildingId,
    code: system.code,
    type: system.type,
    commissionedOn: system.commissionedOn,
    serviceIntervalDays: system.serviceIntervalDays,
    lastServicedOn: system.lastServicedOn,
    status: system.status,
  };
}

/** Prisma-backed {@link FacilitySystemRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaFacilitySystemRepository implements FacilitySystemRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<FacilitySystem | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.facilitySystem.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCodeInBuilding(
    tenantId: TenantId,
    buildingId: Uuid,
    code: string,
  ): Promise<FacilitySystem | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.facilitySystem.findFirst({
        where: { buildingId, code, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByBuilding(tenantId: TenantId, buildingId: Uuid): Promise<FacilitySystem[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.facilitySystem.findMany({ where: { buildingId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<FacilitySystem[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.facilitySystem.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<FacilitySystem[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.facilitySystem.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(system: FacilitySystem): Promise<void> {
    return withTenant(this.db, system.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(system);
      await tx.facilitySystem.upsert({
        where: { id: system.id },
        create: { id: system.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.facilitySystem.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
