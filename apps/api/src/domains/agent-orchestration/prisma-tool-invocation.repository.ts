import {
  type AuthorizationOutcome,
  type AuthorizationReason,
  type InvocationStatus,
  type Reversibility,
  type RiskLevel,
  type ToolInvocation,
  type ToolInvocationRepository,
} from "@knowget/agent-orchestration";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface ToolInvocationRow {
  id: string;
  tenantId: string;
  organizationId: string;
  agentId: string;
  planId: string | null;
  stepId: string | null;
  capabilityKey: string;
  ordinal: number;
  riskLevel: string;
  reversibility: string;
  compensationKey: string | null;
  status: string;
  authorizationOutcome: string;
  authorizationReasons: string[];
  approvalRequestId: string | null;
  compensatedByInvocationId: string | null;
  failureCode: string | null;
  startedAt: string | null;
  settledAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ToolInvocationRow): ToolInvocation {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    agentId: row.agentId,
    planId: row.planId,
    stepId: row.stepId,
    capabilityKey: row.capabilityKey,
    ordinal: row.ordinal,
    riskLevel: row.riskLevel as RiskLevel,
    reversibility: row.reversibility as Reversibility,
    compensationKey: row.compensationKey,
    status: row.status as InvocationStatus,
    authorizationOutcome: row.authorizationOutcome as AuthorizationOutcome,
    authorizationReasons: row.authorizationReasons as AuthorizationReason[],
    approvalRequestId: row.approvalRequestId,
    compensatedByInvocationId: row.compensatedByInvocationId,
    failureCode: row.failureCode,
    startedAt: (row.startedAt as ISODateString | null) ?? null,
    settledAt: (row.settledAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(invocation: ToolInvocation) {
  return {
    tenantId: invocation.tenantId,
    organizationId: invocation.organizationId,
    agentId: invocation.agentId,
    planId: invocation.planId,
    stepId: invocation.stepId,
    capabilityKey: invocation.capabilityKey,
    ordinal: invocation.ordinal,
    riskLevel: invocation.riskLevel,
    reversibility: invocation.reversibility,
    compensationKey: invocation.compensationKey,
    status: invocation.status,
    authorizationOutcome: invocation.authorizationOutcome,
    authorizationReasons: [...invocation.authorizationReasons],
    approvalRequestId: invocation.approvalRequestId,
    compensatedByInvocationId: invocation.compensatedByInvocationId,
    failureCode: invocation.failureCode,
    startedAt: invocation.startedAt,
    settledAt: invocation.settledAt,
  };
}

/**
 * Prisma-backed {@link ToolInvocationRepository} (RLS via {@link withTenant}) — the record of what an agent
 * actually did to an institution.
 *
 * No `remove` and no soft-delete filter: this is the one table whose contents an institution would most want to
 * be able to erase after a bad afternoon, which is exactly why nothing above it can. `listByPlan` returns the
 * plan's invocations for the rollback engine to reverse; ordering is left to the domain, which reverses by the
 * recorded `ordinal` rather than by insertion order — the order things happened in is a fact about the run, not
 * a fact about how rows landed.
 */
export class PrismaToolInvocationRepository implements ToolInvocationRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<ToolInvocation | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.toolInvocation.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  listByPlan(tenantId: TenantId, planId: string): Promise<ToolInvocation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.toolInvocation.findMany({ where: { planId } });
      return rows.map(toDomain);
    });
  }

  listByAgent(tenantId: TenantId, agentId: string): Promise<ToolInvocation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.toolInvocation.findMany({ where: { agentId } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<ToolInvocation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.toolInvocation.findMany();
      return rows.map(toDomain);
    });
  }

  save(invocation: ToolInvocation): Promise<void> {
    return withTenant(this.db, invocation.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(invocation);
      await tx.toolInvocation.upsert({
        where: { id: invocation.id },
        create: { id: invocation.id, ...fields },
        update: fields,
      });
    });
  }
}
