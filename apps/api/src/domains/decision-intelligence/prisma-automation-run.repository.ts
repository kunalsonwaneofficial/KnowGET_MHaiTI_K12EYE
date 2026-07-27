import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type ActionView,
  type AutomationRun,
  type AutomationRunRepository,
  type AutonomyDisposition,
  type AutonomyMode,
  type AutonomyReason,
  type CompensationState,
  type ObservedFact,
  type RunStatus,
} from "@knowget/decision-intelligence";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface AutomationRunRow {
  id: string;
  tenantId: string;
  organizationId: string;
  ruleId: string;
  ruleKey: string;
  signalKey: string;
  subjectDomain: string;
  subjectId: string;
  recommendationId: string | null;
  action: unknown;
  autonomyMode: string;
  disposition: string;
  reasons: string[];
  observedFacts: unknown;
  status: string;
  approvedByUserId: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
  rejectedByUserId: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  executionRef: string | null;
  executionRequestedAt: string | null;
  executionError: string | null;
  compensationState: string;
  compensationRef: string | null;
  compensatedAt: string | null;
  firedAt: string;
  settledAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AutomationRunRow): AutomationRun {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    ruleId: row.ruleId as Uuid,
    ruleKey: row.ruleKey,
    signalKey: row.signalKey,
    subjectDomain: row.subjectDomain,
    subjectId: row.subjectId,
    recommendationId: (row.recommendationId as Uuid | null) ?? null,
    action: row.action as ActionView,
    autonomyMode: row.autonomyMode as AutonomyMode,
    disposition: row.disposition as AutonomyDisposition,
    reasons: row.reasons as AutonomyReason[],
    observedFacts: (row.observedFacts as ObservedFact[]) ?? [],
    status: row.status as RunStatus,
    approvedByUserId: row.approvedByUserId,
    approvedAt: (row.approvedAt as ISODateString | null) ?? null,
    approvalNote: row.approvalNote,
    rejectedByUserId: row.rejectedByUserId,
    rejectedAt: (row.rejectedAt as ISODateString | null) ?? null,
    rejectionReason: row.rejectionReason,
    executionRef: row.executionRef,
    executionRequestedAt: (row.executionRequestedAt as ISODateString | null) ?? null,
    executionError: row.executionError,
    compensationState: row.compensationState as CompensationState,
    compensationRef: row.compensationRef,
    compensatedAt: (row.compensatedAt as ISODateString | null) ?? null,
    firedAt: row.firedAt as ISODateString,
    settledAt: (row.settledAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(run: AutomationRun) {
  return {
    tenantId: run.tenantId,
    organizationId: run.organizationId,
    ruleId: run.ruleId,
    ruleKey: run.ruleKey,
    signalKey: run.signalKey,
    subjectDomain: run.subjectDomain,
    subjectId: run.subjectId,
    recommendationId: run.recommendationId,
    action: JSON.parse(JSON.stringify(run.action)),
    autonomyMode: run.autonomyMode,
    disposition: run.disposition,
    reasons: [...run.reasons],
    observedFacts: JSON.parse(JSON.stringify(run.observedFacts)),
    status: run.status,
    approvedByUserId: run.approvedByUserId,
    approvedAt: run.approvedAt,
    approvalNote: run.approvalNote,
    rejectedByUserId: run.rejectedByUserId,
    rejectedAt: run.rejectedAt,
    rejectionReason: run.rejectionReason,
    executionRef: run.executionRef,
    executionRequestedAt: run.executionRequestedAt,
    executionError: run.executionError,
    compensationState: run.compensationState,
    compensationRef: run.compensationRef,
    compensatedAt: run.compensatedAt,
    firedAt: run.firedAt,
    settledAt: run.settledAt,
  };
}

/**
 * Prisma-backed {@link AutomationRunRepository} (RLS via {@link withTenant}).
 *
 * A run is the record of a firing, and it is written whatever the autonomy engine decided — including when the
 * decision was "not without a person". That is the contract's first rule made durable rather than procedural:
 * the gate is not a branch that skips the write, it is a `disposition` and a set of `reasons` stored on the
 * firing itself, so "the rule matched but was held" and "the rule never matched" are different rows and not
 * the same silence. `observed_facts` holds the operands the conditions actually compared, which is what turns
 * a run from an assertion that it matched into something a person can check.
 *
 * `listAwaitingApproval` is the human queue and `listCompensationDue` the reversal queue; both read a stored
 * status rather than re-deriving one, and each has an index behind it — a queue that has to scan every firing
 * an institution has ever made is a queue nobody keeps open.
 *
 * There is no `remove`. What an institution's automation did, on whose authority, and on what grounds is
 * precisely the thing an audit asks for.
 */
export class PrismaAutomationRunRepository implements AutomationRunRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<AutomationRun | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.automationRun.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  listByRule(tenantId: TenantId, ruleId: Uuid): Promise<AutomationRun[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.automationRun.findMany({ where: { ruleId } });
      return rows.map(toDomain);
    });
  }

  listBySubject(
    tenantId: TenantId,
    subjectDomain: string,
    subjectId: string,
  ): Promise<AutomationRun[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.automationRun.findMany({ where: { subjectDomain, subjectId } });
      return rows.map(toDomain);
    });
  }

  listAwaitingApproval(tenantId: TenantId): Promise<AutomationRun[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.automationRun.findMany({ where: { status: "awaiting_approval" } });
      return rows.map(toDomain);
    });
  }

  listCompensationDue(tenantId: TenantId): Promise<AutomationRun[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.automationRun.findMany({ where: { compensationState: "available" } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<AutomationRun[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.automationRun.findMany();
      return rows.map(toDomain);
    });
  }

  save(run: AutomationRun): Promise<void> {
    return withTenant(this.db, run.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(run);
      await tx.automationRun.upsert({
        where: { id: run.id },
        create: { id: run.id, ...fields },
        update: fields,
      });
    });
  }
}
