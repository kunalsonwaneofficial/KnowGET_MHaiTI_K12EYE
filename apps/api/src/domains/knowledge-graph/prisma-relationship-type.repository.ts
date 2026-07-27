import {
  type Cardinality,
  type RelationshipType,
  type RelationshipTypeRepository,
  type TypeStatus,
} from "@knowget/knowledge-graph";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface RelationshipTypeRow {
  id: string;
  tenantId: string;
  organizationId: string;
  key: string;
  label: string;
  sourceEntityTypeKey: string;
  targetEntityTypeKey: string;
  cardinality: string;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: RelationshipTypeRow): RelationshipType {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    key: row.key,
    label: row.label,
    sourceEntityTypeKey: row.sourceEntityTypeKey,
    targetEntityTypeKey: row.targetEntityTypeKey,
    cardinality: row.cardinality as Cardinality,
    description: row.description,
    status: row.status as TypeStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(type: RelationshipType) {
  return {
    tenantId: type.tenantId,
    organizationId: type.organizationId,
    key: type.key,
    label: type.label,
    sourceEntityTypeKey: type.sourceEntityTypeKey,
    targetEntityTypeKey: type.targetEntityTypeKey,
    cardinality: type.cardinality,
    description: type.description,
    status: type.status,
  };
}

/** Prisma-backed {@link RelationshipTypeRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaRelationshipTypeRepository implements RelationshipTypeRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<RelationshipType | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.relationshipType.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByKey(tenantId: TenantId, key: string): Promise<RelationshipType | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.relationshipType.findFirst({ where: { key, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByTenant(tenantId: TenantId): Promise<RelationshipType[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.relationshipType.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(type: RelationshipType): Promise<void> {
    return withTenant(this.db, type.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(type);
      await tx.relationshipType.upsert({
        where: { id: type.id },
        create: { id: type.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.relationshipType.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
