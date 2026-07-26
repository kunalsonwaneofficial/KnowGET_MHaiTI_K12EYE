import {
  type RelationshipStatus,
  type SemanticRelationship,
  type SemanticRelationshipRepository,
} from "@knowget/knowledge-graph";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface SemanticRelationshipRow {
  id: string;
  tenantId: string;
  organizationId: string;
  relationshipTypeKey: string;
  sourceEntityId: string;
  targetEntityId: string;
  validFrom: string;
  validTo: string | null;
  version: number;
  supersedesId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: SemanticRelationshipRow): SemanticRelationship {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    relationshipTypeKey: row.relationshipTypeKey,
    sourceEntityId: row.sourceEntityId as Uuid,
    targetEntityId: row.targetEntityId as Uuid,
    validFrom: row.validFrom,
    validTo: row.validTo,
    version: row.version,
    supersedesId: row.supersedesId as Uuid | null,
    status: row.status as RelationshipStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(rel: SemanticRelationship) {
  return {
    tenantId: rel.tenantId,
    organizationId: rel.organizationId,
    relationshipTypeKey: rel.relationshipTypeKey,
    sourceEntityId: rel.sourceEntityId,
    targetEntityId: rel.targetEntityId,
    validFrom: rel.validFrom,
    validTo: rel.validTo,
    version: rel.version,
    supersedesId: rel.supersedesId,
    status: rel.status,
  };
}

/** Prisma-backed {@link SemanticRelationshipRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaSemanticRelationshipRepository implements SemanticRelationshipRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<SemanticRelationship | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.semanticRelationship.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByEntity(tenantId: TenantId, entityId: Uuid): Promise<SemanticRelationship[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.semanticRelationship.findMany({
        where: {
          deletedAt: null,
          OR: [{ sourceEntityId: entityId }, { targetEntityId: entityId }],
        },
      });
      return rows.map(toDomain);
    });
  }

  listBetween(
    tenantId: TenantId,
    sourceEntityId: Uuid,
    targetEntityId: Uuid,
    relationshipTypeKey: string,
  ): Promise<SemanticRelationship[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.semanticRelationship.findMany({
        where: { sourceEntityId, targetEntityId, relationshipTypeKey, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<SemanticRelationship[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.semanticRelationship.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(rel: SemanticRelationship): Promise<void> {
    return withTenant(this.db, rel.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(rel);
      await tx.semanticRelationship.upsert({
        where: { id: rel.id },
        create: { id: rel.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.semanticRelationship.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
