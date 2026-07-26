import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { Space, SpaceRepository, SpaceStatus, SpaceType } from "@knowget/facilities";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface SpaceRow {
  id: string;
  tenantId: string;
  organizationId: string;
  buildingId: string;
  code: string;
  type: string;
  floor: number;
  capacity: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: SpaceRow): Space {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    buildingId: row.buildingId as Uuid,
    code: row.code,
    type: row.type as SpaceType,
    floor: row.floor,
    capacity: row.capacity,
    status: row.status as SpaceStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(space: Space) {
  return {
    tenantId: space.tenantId,
    organizationId: space.organizationId,
    buildingId: space.buildingId,
    code: space.code,
    type: space.type,
    floor: space.floor,
    capacity: space.capacity,
    status: space.status,
  };
}

/** Prisma-backed {@link SpaceRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaSpaceRepository implements SpaceRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Space | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.space.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCodeInBuilding(tenantId: TenantId, buildingId: Uuid, code: string): Promise<Space | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.space.findFirst({ where: { buildingId, code, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByBuilding(tenantId: TenantId, buildingId: Uuid): Promise<Space[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.space.findMany({ where: { buildingId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Space[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.space.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Space[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.space.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(space: Space): Promise<void> {
    return withTenant(this.db, space.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(space);
      await tx.space.upsert({
        where: { id: space.id },
        create: { id: space.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.space.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
