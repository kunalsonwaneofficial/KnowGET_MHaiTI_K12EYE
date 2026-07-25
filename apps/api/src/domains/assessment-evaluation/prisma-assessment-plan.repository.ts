import type {
  AssessmentPlan,
  AssessmentPlanRepository,
  AssessmentPlanStatus,
  AssessmentPlanType,
  PlannedAssessment,
} from "@knowget/assessment-evaluation";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface AssessmentPlanRow {
  id: string;
  tenantId: string;
  organizationId: string;
  planType: string;
  title: string;
  academicYear: string | null;
  term: string | null;
  subjectId: string | null;
  gradeId: string | null;
  plannedAssessments: unknown;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AssessmentPlanRow): AssessmentPlan {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    planType: row.planType as AssessmentPlanType,
    title: row.title,
    academicYear: row.academicYear,
    term: row.term,
    subjectId: row.subjectId as Uuid | null,
    gradeId: row.gradeId as Uuid | null,
    plannedAssessments: (row.plannedAssessments as PlannedAssessment[]) ?? [],
    status: row.status as AssessmentPlanStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(plan: AssessmentPlan) {
  return {
    tenantId: plan.tenantId,
    organizationId: plan.organizationId,
    planType: plan.planType,
    title: plan.title,
    academicYear: plan.academicYear,
    term: plan.term,
    subjectId: plan.subjectId,
    gradeId: plan.gradeId,
    plannedAssessments: JSON.parse(JSON.stringify(plan.plannedAssessments)),
    status: plan.status,
  };
}

/** Prisma-backed {@link AssessmentPlanRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaAssessmentPlanRepository implements AssessmentPlanRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<AssessmentPlan | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.assessmentPlan.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AssessmentPlan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.assessmentPlan.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<AssessmentPlan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.assessmentPlan.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(plan: AssessmentPlan): Promise<void> {
    return withTenant(this.db, plan.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(plan);
      await tx.assessmentPlan.upsert({
        where: { id: plan.id },
        create: { id: plan.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.assessmentPlan.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
