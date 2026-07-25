import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  CurriculumFramework,
  CurriculumFrameworkRepository,
  CurriculumRevision,
  CurriculumStatus,
} from "@knowget/academic-structure";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface CurriculumFrameworkRow {
  id: string;
  tenantId: string;
  organizationId: string;
  name: string;
  code: string;
  board: string;
  version: number;
  status: string;
  learningPhilosophy: string | null;
  competencyModel: string | null;
  assessmentPhilosophy: string | null;
  subjectFramework: string[];
  revisions: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: CurriculumFrameworkRow): CurriculumFramework {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    name: row.name,
    code: row.code,
    board: row.board,
    version: row.version,
    status: row.status as CurriculumStatus,
    learningPhilosophy: row.learningPhilosophy,
    competencyModel: row.competencyModel,
    assessmentPhilosophy: row.assessmentPhilosophy,
    subjectFramework: [...(row.subjectFramework ?? [])],
    revisions: (row.revisions as CurriculumRevision[]) ?? [],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(framework: CurriculumFramework) {
  return {
    tenantId: framework.tenantId,
    organizationId: framework.organizationId,
    name: framework.name,
    code: framework.code,
    board: framework.board,
    version: framework.version,
    status: framework.status,
    learningPhilosophy: framework.learningPhilosophy,
    competencyModel: framework.competencyModel,
    assessmentPhilosophy: framework.assessmentPhilosophy,
    subjectFramework: [...framework.subjectFramework],
    revisions: JSON.parse(JSON.stringify(framework.revisions)),
  };
}

/** Prisma-backed {@link CurriculumFrameworkRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaCurriculumFrameworkRepository implements CurriculumFrameworkRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<CurriculumFramework | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.curriculumFramework.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<CurriculumFramework | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.curriculumFramework.findFirst({
        where: { organizationId, code, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<CurriculumFramework[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.curriculumFramework.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<CurriculumFramework[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.curriculumFramework.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(framework: CurriculumFramework): Promise<void> {
    return withTenant(this.db, framework.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(framework);
      await tx.curriculumFramework.upsert({
        where: { id: framework.id },
        create: { id: framework.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.curriculumFramework.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
