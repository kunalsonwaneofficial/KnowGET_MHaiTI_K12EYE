import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  GrowthGoal,
  GrowthPlan,
  GrowthPlanRepository,
  GrowthPlanStatus,
  InsightDimension,
  InsightEvent,
} from "@knowget/learning-intelligence";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface GrowthPlanRow {
  id: string;
  tenantId: string;
  organizationId: string;
  studentId: string;
  title: string;
  focusDimension: string | null;
  goals: unknown;
  sourceRecommendationIds: unknown;
  progressPercent: number;
  status: string;
  history: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: GrowthPlanRow): GrowthPlan {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    studentId: row.studentId as Uuid,
    title: row.title,
    focusDimension: row.focusDimension as InsightDimension | null,
    goals: (row.goals as GrowthGoal[]) ?? [],
    sourceRecommendationIds: (row.sourceRecommendationIds as Uuid[]) ?? [],
    progressPercent: row.progressPercent,
    status: row.status as GrowthPlanStatus,
    history: (row.history as InsightEvent[]) ?? [],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(plan: GrowthPlan) {
  return {
    tenantId: plan.tenantId,
    organizationId: plan.organizationId,
    studentId: plan.studentId,
    title: plan.title,
    focusDimension: plan.focusDimension,
    goals: JSON.parse(JSON.stringify(plan.goals)),
    sourceRecommendationIds: JSON.parse(JSON.stringify(plan.sourceRecommendationIds)),
    progressPercent: plan.progressPercent,
    status: plan.status,
    history: JSON.parse(JSON.stringify(plan.history)),
  };
}

/** Prisma-backed {@link GrowthPlanRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaGrowthPlanRepository implements GrowthPlanRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<GrowthPlan | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.growthPlan.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<GrowthPlan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.growthPlan.findMany({ where: { studentId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<GrowthPlan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.growthPlan.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<GrowthPlan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.growthPlan.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(plan: GrowthPlan): Promise<void> {
    return withTenant(this.db, plan.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(plan);
      await tx.growthPlan.upsert({
        where: { id: plan.id },
        create: { id: plan.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.growthPlan.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
