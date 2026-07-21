import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  Intervention,
  InterventionPlan,
  InterventionPlanRepository,
} from "@knowget/learner-wellbeing";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface InterventionPlanRow {
  id: string;
  tenantId: string;
  organizationId: string;
  studentId: string;
  earlyWarningTriggers: string[];
  interventions: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: InterventionPlanRow): InterventionPlan {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    studentId: row.studentId as Uuid,
    earlyWarningTriggers: [...(row.earlyWarningTriggers ?? [])],
    interventions: (row.interventions as Intervention[]) ?? [],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(plan: InterventionPlan) {
  return {
    tenantId: plan.tenantId,
    organizationId: plan.organizationId,
    studentId: plan.studentId,
    earlyWarningTriggers: [...plan.earlyWarningTriggers],
    interventions: JSON.parse(JSON.stringify(plan.interventions)),
  };
}

/** Prisma-backed {@link InterventionPlanRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaInterventionPlanRepository implements InterventionPlanRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<InterventionPlan | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.interventionPlan.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByStudent(tenantId: TenantId, studentId: Uuid): Promise<InterventionPlan | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.interventionPlan.findFirst({ where: { studentId, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<InterventionPlan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.interventionPlan.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<InterventionPlan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.interventionPlan.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(plan: InterventionPlan): Promise<void> {
    return withTenant(this.db, plan.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(plan);
      await tx.interventionPlan.upsert({
        where: { id: plan.id },
        create: { id: plan.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.interventionPlan.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
