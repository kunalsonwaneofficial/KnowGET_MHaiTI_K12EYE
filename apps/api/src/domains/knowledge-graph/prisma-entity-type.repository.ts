import {
  type EntityType,
  type EntityTypeRepository,
  type TypeStatus,
} from "@knowget/knowledge-graph";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface EntityTypeRow {
  id: string;
  tenantId: string;
  organizationId: string;
  key: string;
  label: string;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: EntityTypeRow): EntityType {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    key: row.key,
    label: row.label,
    description: row.description,
    status: row.status as TypeStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(type: EntityType) {
  return {
    tenantId: type.tenantId,
    organizationId: type.organizationId,
    key: type.key,
    label: type.label,
    description: type.description,
    status: type.status,
  };
}

/** Prisma-backed {@link EntityTypeRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaEntityTypeRepository implements EntityTypeRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<EntityType | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.entityType.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByKey(tenantId: TenantId, key: string): Promise<EntityType | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.entityType.findFirst({ where: { key, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByTenant(tenantId: TenantId): Promise<EntityType[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.entityType.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(type: EntityType): Promise<void> {
    return withTenant(this.db, type.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(type);
      await tx.entityType.upsert({
        where: { id: type.id },
        create: { id: type.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.entityType.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
