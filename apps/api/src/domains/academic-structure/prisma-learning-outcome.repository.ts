import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  BloomLevel,
  LearningOutcome,
  LearningOutcomeRepository,
  LearningOutcomeStatus,
} from "@knowget/academic-structure";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface LearningOutcomeRow {
  id: string;
  tenantId: string;
  organizationId: string;
  subjectId: string;
  code: string;
  statement: string;
  bloomLevel: string | null;
  competencies: string[];
  curriculumFrameworkId: string | null;
  assessmentAlignment: string[];
  version: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: LearningOutcomeRow): LearningOutcome {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    subjectId: row.subjectId as Uuid,
    code: row.code,
    statement: row.statement,
    bloomLevel: (row.bloomLevel as BloomLevel | null) ?? null,
    competencies: [...(row.competencies ?? [])],
    curriculumFrameworkId: (row.curriculumFrameworkId as Uuid | null) ?? null,
    assessmentAlignment: [...(row.assessmentAlignment ?? [])],
    version: row.version,
    status: row.status as LearningOutcomeStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(outcome: LearningOutcome) {
  return {
    tenantId: outcome.tenantId,
    organizationId: outcome.organizationId,
    subjectId: outcome.subjectId,
    code: outcome.code,
    statement: outcome.statement,
    bloomLevel: outcome.bloomLevel,
    competencies: [...outcome.competencies],
    curriculumFrameworkId: outcome.curriculumFrameworkId,
    assessmentAlignment: [...outcome.assessmentAlignment],
    version: outcome.version,
    status: outcome.status,
  };
}

/** Prisma-backed {@link LearningOutcomeRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaLearningOutcomeRepository implements LearningOutcomeRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<LearningOutcome | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.learningOutcome.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, subjectId: Uuid, code: string): Promise<LearningOutcome | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.learningOutcome.findFirst({
        where: { subjectId, code, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listBySubject(tenantId: TenantId, subjectId: Uuid): Promise<LearningOutcome[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.learningOutcome.findMany({ where: { subjectId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<LearningOutcome[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.learningOutcome.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<LearningOutcome[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.learningOutcome.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(outcome: LearningOutcome): Promise<void> {
    return withTenant(this.db, outcome.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(outcome);
      await tx.learningOutcome.upsert({
        where: { id: outcome.id },
        create: { id: outcome.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.learningOutcome.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
