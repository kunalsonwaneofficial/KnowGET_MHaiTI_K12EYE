import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type {
  LearningResource,
  LearningResourceRepository,
  LearningResourceRevision,
  LearningResourceStatus,
  LearningResourceType,
} from "@knowget/teaching-learning";
import type { TenantId, Uuid } from "@knowget/types";

interface LearningResourceRow {
  id: string;
  tenantId: string;
  organizationId: string;
  title: string;
  resourceType: string;
  description: string | null;
  url: string | null;
  tags: unknown;
  subjectId: string | null;
  learningOutcomeIds: unknown;
  version: number;
  status: string;
  revisions: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: LearningResourceRow): LearningResource {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    title: row.title,
    resourceType: row.resourceType as LearningResourceType,
    description: row.description,
    url: row.url,
    tags: (row.tags as string[]) ?? [],
    subjectId: row.subjectId as Uuid | null,
    learningOutcomeIds: (row.learningOutcomeIds as Uuid[]) ?? [],
    version: row.version,
    status: row.status as LearningResourceStatus,
    revisions: (row.revisions as LearningResourceRevision[]) ?? [],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(resource: LearningResource) {
  return {
    tenantId: resource.tenantId,
    organizationId: resource.organizationId,
    title: resource.title,
    resourceType: resource.resourceType,
    description: resource.description,
    url: resource.url,
    tags: JSON.parse(JSON.stringify(resource.tags)),
    subjectId: resource.subjectId,
    learningOutcomeIds: JSON.parse(JSON.stringify(resource.learningOutcomeIds)),
    version: resource.version,
    status: resource.status,
    revisions: JSON.parse(JSON.stringify(resource.revisions)),
  };
}

/** Prisma-backed {@link LearningResourceRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaLearningResourceRepository implements LearningResourceRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<LearningResource | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.learningResource.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listBySubject(tenantId: TenantId, subjectId: Uuid): Promise<LearningResource[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.learningResource.findMany({ where: { subjectId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<LearningResource[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.learningResource.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<LearningResource[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.learningResource.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(resource: LearningResource): Promise<void> {
    return withTenant(this.db, resource.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(resource);
      await tx.learningResource.upsert({
        where: { id: resource.id },
        create: { id: resource.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.learningResource.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
