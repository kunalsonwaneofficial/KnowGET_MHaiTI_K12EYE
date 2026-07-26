import { type EntityMemory, type EntityMemoryRepository } from "@knowget/knowledge-graph";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface EntityMemoryRow {
  id: string;
  tenantId: string;
  organizationId: string;
  entityId: string;
  outDegree: number;
  inDegree: number;
  degree: number;
  assertionCount: number;
  groundedAssertionCount: number;
  aggregateConfidence: number;
  refreshedAt: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: EntityMemoryRow): EntityMemory {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    entityId: row.entityId as Uuid,
    outDegree: row.outDegree,
    inDegree: row.inDegree,
    degree: row.degree,
    assertionCount: row.assertionCount,
    groundedAssertionCount: row.groundedAssertionCount,
    aggregateConfidence: row.aggregateConfidence,
    refreshedAt: row.refreshedAt as ISODateString,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(m: EntityMemory) {
  return {
    tenantId: m.tenantId,
    organizationId: m.organizationId,
    entityId: m.entityId,
    outDegree: m.outDegree,
    inDegree: m.inDegree,
    degree: m.degree,
    assertionCount: m.assertionCount,
    groundedAssertionCount: m.groundedAssertionCount,
    aggregateConfidence: m.aggregateConfidence,
    refreshedAt: m.refreshedAt,
  };
}

/** Prisma-backed {@link EntityMemoryRepository} (RLS via {@link withTenant}). Re-derivable read model. */
export class PrismaEntityMemoryRepository implements EntityMemoryRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<EntityMemory | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.entityMemory.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByEntity(tenantId: TenantId, entityId: Uuid): Promise<EntityMemory | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.entityMemory.findFirst({ where: { entityId, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByTenant(tenantId: TenantId): Promise<EntityMemory[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.entityMemory.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(m: EntityMemory): Promise<void> {
    return withTenant(this.db, m.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(m);
      await tx.entityMemory.upsert({
        where: { id: m.id },
        create: { id: m.id, ...fields },
        update: fields,
      });
    });
  }
}
