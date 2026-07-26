import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  Building,
  BuildingRepository,
  BuildingStatus,
  BuildingType,
} from "@knowget/facilities";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface BuildingRow {
  id: string;
  tenantId: string;
  organizationId: string;
  code: string;
  name: string;
  type: string;
  floors: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: BuildingRow): Building {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    code: row.code,
    name: row.name,
    type: row.type as BuildingType,
    floors: row.floors,
    status: row.status as BuildingStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(building: Building) {
  return {
    tenantId: building.tenantId,
    organizationId: building.organizationId,
    code: building.code,
    name: building.name,
    type: building.type,
    floors: building.floors,
    status: building.status,
  };
}

/** Prisma-backed {@link BuildingRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaBuildingRepository implements BuildingRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Building | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.building.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, code: string): Promise<Building | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.building.findFirst({ where: { code, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Building[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.building.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Building[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.building.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(building: Building): Promise<void> {
    return withTenant(this.db, building.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(building);
      await tx.building.upsert({
        where: { id: building.id },
        create: { id: building.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.building.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
