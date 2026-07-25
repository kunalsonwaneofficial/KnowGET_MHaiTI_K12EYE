import type {
  Assessment,
  AssessmentRepository,
  AssessmentStatus,
  AssessmentType,
  DeliveryMode,
  EvaluationStrategy,
  RubricCriterion,
} from "@knowget/assessment-evaluation";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface AssessmentRow {
  id: string;
  tenantId: string;
  organizationId: string;
  subjectId: string;
  frameworkId: string | null;
  planId: string | null;
  assessmentType: string;
  title: string;
  learningOutcomeIds: unknown;
  competencies: unknown;
  maximumMarks: number;
  rubric: unknown;
  evaluationStrategy: string;
  deliveryMode: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AssessmentRow): Assessment {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    subjectId: row.subjectId as Uuid,
    frameworkId: row.frameworkId as Uuid | null,
    planId: row.planId as Uuid | null,
    assessmentType: row.assessmentType as AssessmentType,
    title: row.title,
    learningOutcomeIds: (row.learningOutcomeIds as Uuid[]) ?? [],
    competencies: (row.competencies as string[]) ?? [],
    maximumMarks: row.maximumMarks,
    rubric: (row.rubric as RubricCriterion[]) ?? [],
    evaluationStrategy: row.evaluationStrategy as EvaluationStrategy,
    deliveryMode: row.deliveryMode as DeliveryMode,
    status: row.status as AssessmentStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(assessment: Assessment) {
  return {
    tenantId: assessment.tenantId,
    organizationId: assessment.organizationId,
    subjectId: assessment.subjectId,
    frameworkId: assessment.frameworkId,
    planId: assessment.planId,
    assessmentType: assessment.assessmentType,
    title: assessment.title,
    learningOutcomeIds: JSON.parse(JSON.stringify(assessment.learningOutcomeIds)),
    competencies: JSON.parse(JSON.stringify(assessment.competencies)),
    maximumMarks: assessment.maximumMarks,
    rubric: JSON.parse(JSON.stringify(assessment.rubric)),
    evaluationStrategy: assessment.evaluationStrategy,
    deliveryMode: assessment.deliveryMode,
    status: assessment.status,
  };
}

/** Prisma-backed {@link AssessmentRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaAssessmentRepository implements AssessmentRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Assessment | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.assessment.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listBySubject(tenantId: TenantId, subjectId: Uuid): Promise<Assessment[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.assessment.findMany({ where: { subjectId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Assessment[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.assessment.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Assessment[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.assessment.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(assessment: Assessment): Promise<void> {
    return withTenant(this.db, assessment.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(assessment);
      await tx.assessment.upsert({
        where: { id: assessment.id },
        create: { id: assessment.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.assessment.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
