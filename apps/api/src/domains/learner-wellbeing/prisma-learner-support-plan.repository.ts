import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  LearnerSupportPlan,
  LearnerSupportPlanRepository,
  ReviewSchedule,
  SupportGoal,
  SupportPlanStatus,
} from "@knowget/learner-wellbeing";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface LearnerSupportPlanRow {
  id: string;
  tenantId: string;
  organizationId: string;
  studentId: string;
  status: string;
  academicAccommodations: string[];
  medicalAccommodations: string[];
  behaviourInterventions: string[];
  inclusionStrategies: string[];
  goals: unknown;
  reviewSchedule: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: LearnerSupportPlanRow): LearnerSupportPlan {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    studentId: row.studentId as Uuid,
    status: row.status as SupportPlanStatus,
    academicAccommodations: [...(row.academicAccommodations ?? [])],
    medicalAccommodations: [...(row.medicalAccommodations ?? [])],
    behaviourInterventions: [...(row.behaviourInterventions ?? [])],
    inclusionStrategies: [...(row.inclusionStrategies ?? [])],
    goals: (row.goals as SupportGoal[]) ?? [],
    reviewSchedule: row.reviewSchedule as ReviewSchedule,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(plan: LearnerSupportPlan) {
  return {
    tenantId: plan.tenantId,
    organizationId: plan.organizationId,
    studentId: plan.studentId,
    status: plan.status,
    academicAccommodations: [...plan.academicAccommodations],
    medicalAccommodations: [...plan.medicalAccommodations],
    behaviourInterventions: [...plan.behaviourInterventions],
    inclusionStrategies: [...plan.inclusionStrategies],
    goals: JSON.parse(JSON.stringify(plan.goals)),
    reviewSchedule: JSON.parse(JSON.stringify(plan.reviewSchedule)),
  };
}

/** Prisma-backed {@link LearnerSupportPlanRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaLearnerSupportPlanRepository implements LearnerSupportPlanRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<LearnerSupportPlan | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.learnerSupportPlan.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByStudent(tenantId: TenantId, studentId: Uuid): Promise<LearnerSupportPlan | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.learnerSupportPlan.findFirst({ where: { studentId, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<LearnerSupportPlan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.learnerSupportPlan.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<LearnerSupportPlan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.learnerSupportPlan.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(plan: LearnerSupportPlan): Promise<void> {
    return withTenant(this.db, plan.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(plan);
      await tx.learnerSupportPlan.upsert({
        where: { id: plan.id },
        create: { id: plan.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.learnerSupportPlan.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
