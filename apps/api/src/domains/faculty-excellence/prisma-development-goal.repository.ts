import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  DevelopmentGoal,
  DevelopmentGoalRepository,
  GoalStatus,
} from "@knowget/faculty-excellence";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface DevelopmentGoalRow {
  id: string;
  tenantId: string;
  organizationId: string;
  employeeId: string;
  description: string;
  targetCompetencyKey: string | null;
  frameworkId: string | null;
  engagementId: string | null;
  targetDate: string | null;
  status: string;
  outcome: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: DevelopmentGoalRow): DevelopmentGoal {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    employeeId: row.employeeId as Uuid,
    description: row.description,
    targetCompetencyKey: row.targetCompetencyKey,
    frameworkId: (row.frameworkId as Uuid | null) ?? null,
    engagementId: (row.engagementId as Uuid | null) ?? null,
    targetDate: row.targetDate,
    status: row.status as GoalStatus,
    outcome: row.outcome,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(goal: DevelopmentGoal) {
  return {
    tenantId: goal.tenantId,
    organizationId: goal.organizationId,
    employeeId: goal.employeeId,
    description: goal.description,
    targetCompetencyKey: goal.targetCompetencyKey,
    frameworkId: goal.frameworkId,
    engagementId: goal.engagementId,
    targetDate: goal.targetDate,
    status: goal.status,
    outcome: goal.outcome,
  };
}

/** Prisma-backed {@link DevelopmentGoalRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaDevelopmentGoalRepository implements DevelopmentGoalRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<DevelopmentGoal | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.developmentGoal.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<DevelopmentGoal[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.developmentGoal.findMany({ where: { employeeId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<DevelopmentGoal[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.developmentGoal.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(goal: DevelopmentGoal): Promise<void> {
    return withTenant(this.db, goal.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(goal);
      await tx.developmentGoal.upsert({
        where: { id: goal.id },
        create: { id: goal.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.developmentGoal.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
