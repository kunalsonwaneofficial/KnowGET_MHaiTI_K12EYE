import type {
  AssessmentFramework,
  AssessmentFrameworkRepository,
  AssessmentFrameworkRevision,
  AssessmentFrameworkStatus,
  AssessmentModel,
  GradeBand,
} from "@knowget/assessment-evaluation";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface AssessmentFrameworkRow {
  id: string;
  tenantId: string;
  organizationId: string;
  code: string;
  name: string;
  assessmentModel: string;
  weightageRules: unknown;
  gradeBands: unknown;
  competencyModel: unknown;
  promotionCriteria: unknown;
  version: number;
  status: string;
  revisions: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AssessmentFrameworkRow): AssessmentFramework {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    code: row.code,
    name: row.name,
    assessmentModel: row.assessmentModel as AssessmentModel,
    weightageRules: (row.weightageRules as Record<string, unknown>) ?? {},
    gradeBands: (row.gradeBands as GradeBand[]) ?? [],
    competencyModel: (row.competencyModel as string[]) ?? [],
    promotionCriteria: (row.promotionCriteria as Record<string, unknown>) ?? {},
    version: row.version,
    status: row.status as AssessmentFrameworkStatus,
    revisions: (row.revisions as AssessmentFrameworkRevision[]) ?? [],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(framework: AssessmentFramework) {
  return {
    tenantId: framework.tenantId,
    organizationId: framework.organizationId,
    code: framework.code,
    name: framework.name,
    assessmentModel: framework.assessmentModel,
    weightageRules: JSON.parse(JSON.stringify(framework.weightageRules)),
    gradeBands: JSON.parse(JSON.stringify(framework.gradeBands)),
    competencyModel: JSON.parse(JSON.stringify(framework.competencyModel)),
    promotionCriteria: JSON.parse(JSON.stringify(framework.promotionCriteria)),
    version: framework.version,
    status: framework.status,
    revisions: JSON.parse(JSON.stringify(framework.revisions)),
  };
}

/** Prisma-backed {@link AssessmentFrameworkRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaAssessmentFrameworkRepository implements AssessmentFrameworkRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<AssessmentFramework | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.assessmentFramework.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<AssessmentFramework | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.assessmentFramework.findFirst({
        where: { organizationId, code, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AssessmentFramework[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.assessmentFramework.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<AssessmentFramework[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.assessmentFramework.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(framework: AssessmentFramework): Promise<void> {
    return withTenant(this.db, framework.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(framework);
      await tx.assessmentFramework.upsert({
        where: { id: framework.id },
        create: { id: framework.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.assessmentFramework.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
