import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type {
  LessonPlan,
  LessonPlanRepository,
  LessonPlanRevision,
  LessonPlanStatus,
} from "@knowget/teaching-learning";
import type { TenantId, Uuid } from "@knowget/types";

interface LessonPlanRow {
  id: string;
  tenantId: string;
  organizationId: string;
  subjectId: string;
  unitPlanId: string | null;
  title: string;
  objectives: unknown;
  learningOutcomeIds: unknown;
  teachingStrategies: unknown;
  learningActivities: unknown;
  assessmentCheckpoints: unknown;
  requiredResourceIds: unknown;
  differentiationStrategies: unknown;
  reflectionNotes: string | null;
  version: number;
  status: string;
  revisions: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: LessonPlanRow): LessonPlan {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    subjectId: row.subjectId as Uuid,
    unitPlanId: row.unitPlanId as Uuid | null,
    title: row.title,
    objectives: (row.objectives as string[]) ?? [],
    learningOutcomeIds: (row.learningOutcomeIds as Uuid[]) ?? [],
    teachingStrategies: (row.teachingStrategies as string[]) ?? [],
    learningActivities: (row.learningActivities as string[]) ?? [],
    assessmentCheckpoints: (row.assessmentCheckpoints as string[]) ?? [],
    requiredResourceIds: (row.requiredResourceIds as Uuid[]) ?? [],
    differentiationStrategies: (row.differentiationStrategies as string[]) ?? [],
    reflectionNotes: row.reflectionNotes,
    version: row.version,
    status: row.status as LessonPlanStatus,
    revisions: (row.revisions as LessonPlanRevision[]) ?? [],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(plan: LessonPlan) {
  return {
    tenantId: plan.tenantId,
    organizationId: plan.organizationId,
    subjectId: plan.subjectId,
    unitPlanId: plan.unitPlanId,
    title: plan.title,
    objectives: JSON.parse(JSON.stringify(plan.objectives)),
    learningOutcomeIds: JSON.parse(JSON.stringify(plan.learningOutcomeIds)),
    teachingStrategies: JSON.parse(JSON.stringify(plan.teachingStrategies)),
    learningActivities: JSON.parse(JSON.stringify(plan.learningActivities)),
    assessmentCheckpoints: JSON.parse(JSON.stringify(plan.assessmentCheckpoints)),
    requiredResourceIds: JSON.parse(JSON.stringify(plan.requiredResourceIds)),
    differentiationStrategies: JSON.parse(JSON.stringify(plan.differentiationStrategies)),
    reflectionNotes: plan.reflectionNotes,
    version: plan.version,
    status: plan.status,
    revisions: JSON.parse(JSON.stringify(plan.revisions)),
  };
}

/** Prisma-backed {@link LessonPlanRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaLessonPlanRepository implements LessonPlanRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<LessonPlan | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.lessonPlan.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listBySubject(tenantId: TenantId, subjectId: Uuid): Promise<LessonPlan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.lessonPlan.findMany({ where: { subjectId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByUnit(tenantId: TenantId, unitPlanId: Uuid): Promise<LessonPlan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.lessonPlan.findMany({ where: { unitPlanId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<LessonPlan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.lessonPlan.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<LessonPlan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.lessonPlan.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(plan: LessonPlan): Promise<void> {
    return withTenant(this.db, plan.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(plan);
      await tx.lessonPlan.upsert({
        where: { id: plan.id },
        create: { id: plan.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.lessonPlan.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
