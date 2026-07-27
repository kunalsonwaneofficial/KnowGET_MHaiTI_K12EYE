import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type InstanceStatus,
  type StageRun,
  type WorkflowInstance,
  type WorkflowInstanceRepository,
  type WorkflowTrigger,
} from "@knowget/decision-intelligence";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface WorkflowInstanceRow {
  id: string;
  tenantId: string;
  organizationId: string;
  workflowId: string;
  workflowKey: string;
  workflowVersion: number;
  subjectDomain: string;
  subjectId: string;
  trigger: string;
  triggeredByUserId: string | null;
  triggeredByRuleId: string | null;
  recommendationId: string | null;
  status: string;
  stageRuns: unknown;
  startedAt: string;
  settledAt: string | null;
  failureStageKey: string | null;
  failureError: string | null;
  cancelledByUserId: string | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: WorkflowInstanceRow): WorkflowInstance {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    workflowId: row.workflowId as Uuid,
    workflowKey: row.workflowKey,
    workflowVersion: row.workflowVersion,
    subjectDomain: row.subjectDomain,
    subjectId: row.subjectId,
    trigger: row.trigger as WorkflowTrigger,
    triggeredByUserId: row.triggeredByUserId,
    triggeredByRuleId: row.triggeredByRuleId,
    recommendationId: (row.recommendationId as Uuid | null) ?? null,
    status: row.status as InstanceStatus,
    stageRuns: (row.stageRuns as StageRun[]) ?? [],
    startedAt: row.startedAt as ISODateString,
    settledAt: (row.settledAt as ISODateString | null) ?? null,
    failureStageKey: row.failureStageKey,
    failureError: row.failureError,
    cancelledByUserId: row.cancelledByUserId,
    cancellationReason: row.cancellationReason,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(instance: WorkflowInstance) {
  return {
    tenantId: instance.tenantId,
    organizationId: instance.organizationId,
    workflowId: instance.workflowId,
    workflowKey: instance.workflowKey,
    workflowVersion: instance.workflowVersion,
    subjectDomain: instance.subjectDomain,
    subjectId: instance.subjectId,
    trigger: instance.trigger,
    triggeredByUserId: instance.triggeredByUserId,
    triggeredByRuleId: instance.triggeredByRuleId,
    recommendationId: instance.recommendationId,
    status: instance.status,
    stageRuns: JSON.parse(JSON.stringify(instance.stageRuns)),
    startedAt: instance.startedAt,
    settledAt: instance.settledAt,
    failureStageKey: instance.failureStageKey,
    failureError: instance.failureError,
    cancelledByUserId: instance.cancelledByUserId,
    cancellationReason: instance.cancellationReason,
  };
}

/**
 * Prisma-backed {@link WorkflowInstanceRepository} (RLS via {@link withTenant}).
 *
 * Stage runs live in the case's own JSONB column. A stage may only begin once the stages it depends on have
 * settled, and that is a statement about the whole case — checkable when the case is loaded whole, and not
 * checkable at all from a stage row somebody can update on its own.
 *
 * `listByWorkflow` is what makes retiring a version honest: you can see what is still running under it before
 * you take it away. `listRunning` is the sweep that finds overdue stages. Neither filters `deletedAt`, because
 * a case has no delete path — what an institution did about one subject, stage by stage, is the whole reason
 * for modelling a process rather than just doing it.
 */
export class PrismaWorkflowInstanceRepository implements WorkflowInstanceRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<WorkflowInstance | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.workflowInstance.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  listByWorkflow(tenantId: TenantId, workflowId: Uuid): Promise<WorkflowInstance[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.workflowInstance.findMany({ where: { workflowId } });
      return rows.map(toDomain);
    });
  }

  listBySubject(
    tenantId: TenantId,
    subjectDomain: string,
    subjectId: string,
  ): Promise<WorkflowInstance[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.workflowInstance.findMany({ where: { subjectDomain, subjectId } });
      return rows.map(toDomain);
    });
  }

  listRunning(tenantId: TenantId): Promise<WorkflowInstance[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.workflowInstance.findMany({ where: { status: "running" } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<WorkflowInstance[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.workflowInstance.findMany();
      return rows.map(toDomain);
    });
  }

  save(instance: WorkflowInstance): Promise<void> {
    return withTenant(this.db, instance.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(instance);
      await tx.workflowInstance.upsert({
        where: { id: instance.id },
        create: { id: instance.id, ...fields },
        update: fields,
      });
    });
  }
}
