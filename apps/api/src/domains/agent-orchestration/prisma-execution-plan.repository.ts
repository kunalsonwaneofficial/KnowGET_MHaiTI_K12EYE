import {
  type ExecutionPlan,
  type ExecutionPlanRepository,
  type ExecutionStep,
  type PlanStatus,
} from "@knowget/agent-orchestration";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface ExecutionPlanRow {
  id: string;
  tenantId: string;
  organizationId: string;
  agentId: string;
  reasoningSessionId: string | null;
  goal: string;
  status: string;
  steps: unknown;
  requiresApproval: boolean;
  approvalRequestId: string | null;
  inspectedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ExecutionPlanRow): ExecutionPlan {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    agentId: row.agentId,
    reasoningSessionId: row.reasoningSessionId,
    goal: row.goal,
    status: row.status as PlanStatus,
    steps: (row.steps as ExecutionStep[]) ?? [],
    requiresApproval: row.requiresApproval,
    approvalRequestId: row.approvalRequestId,
    inspectedAt: (row.inspectedAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(plan: ExecutionPlan) {
  return {
    tenantId: plan.tenantId,
    organizationId: plan.organizationId,
    agentId: plan.agentId,
    reasoningSessionId: plan.reasoningSessionId,
    goal: plan.goal,
    status: plan.status,
    steps: JSON.parse(JSON.stringify(plan.steps)),
    requiresApproval: plan.requiresApproval,
    approvalRequestId: plan.approvalRequestId,
    inspectedAt: plan.inspectedAt,
  };
}

/**
 * Prisma-backed {@link ExecutionPlanRepository} (RLS via {@link withTenant}).
 *
 * Steps live in the plan's own JSONB column and are loaded and saved with it, never apart. The invariants worth
 * having in a plan are invariants *across* steps — an ordinal sequence with no gaps, dependencies that point
 * only backwards, a status the step set actually supports — and every one of them is unenforceable from a row
 * that can be written on its own. Storing them inside the aggregate is what makes "load the plan, apply a pure
 * transition, save the plan" the only way to change one.
 */
export class PrismaExecutionPlanRepository implements ExecutionPlanRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<ExecutionPlan | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.executionPlan.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByAgent(tenantId: TenantId, agentId: string): Promise<ExecutionPlan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.executionPlan.findMany({ where: { agentId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listBySession(tenantId: TenantId, reasoningSessionId: string): Promise<ExecutionPlan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.executionPlan.findMany({
        where: { reasoningSessionId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<ExecutionPlan[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.executionPlan.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(plan: ExecutionPlan): Promise<void> {
    return withTenant(this.db, plan.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(plan);
      await tx.executionPlan.upsert({
        where: { id: plan.id },
        create: { id: plan.id, ...fields },
        update: fields,
      });
    });
  }

  /** Soft-delete. */
  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.executionPlan.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
