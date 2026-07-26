import {
  type EntityStatus,
  type KnowledgeEntity,
  type KnowledgeEntityRepository,
} from "@knowget/knowledge-graph";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface KnowledgeEntityRow {
  id: string;
  tenantId: string;
  organizationId: string;
  entityTypeKey: string;
  sourceDomain: string;
  sourceRef: string;
  label: string | null;
  status: string;
  mergedIntoId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: KnowledgeEntityRow): KnowledgeEntity {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    entityTypeKey: row.entityTypeKey,
    sourceDomain: row.sourceDomain,
    sourceRef: row.sourceRef,
    label: row.label,
    status: row.status as EntityStatus,
    mergedIntoId: row.mergedIntoId as Uuid | null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(entity: KnowledgeEntity) {
  return {
    tenantId: entity.tenantId,
    organizationId: entity.organizationId,
    entityTypeKey: entity.entityTypeKey,
    sourceDomain: entity.sourceDomain,
    sourceRef: entity.sourceRef,
    label: entity.label,
    status: entity.status,
    mergedIntoId: entity.mergedIntoId,
  };
}

/** Prisma-backed {@link KnowledgeEntityRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaKnowledgeEntityRepository implements KnowledgeEntityRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<KnowledgeEntity | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.knowledgeEntity.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findBySource(
    tenantId: TenantId,
    sourceDomain: string,
    sourceRef: string,
  ): Promise<KnowledgeEntity | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.knowledgeEntity.findFirst({
        where: { sourceDomain, sourceRef, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByType(tenantId: TenantId, entityTypeKey: string): Promise<KnowledgeEntity[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.knowledgeEntity.findMany({ where: { entityTypeKey, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<KnowledgeEntity[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.knowledgeEntity.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(entity: KnowledgeEntity): Promise<void> {
    return withTenant(this.db, entity.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(entity);
      await tx.knowledgeEntity.upsert({
        where: { id: entity.id },
        create: { id: entity.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.knowledgeEntity.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
