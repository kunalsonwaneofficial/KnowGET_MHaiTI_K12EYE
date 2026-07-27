import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type ActionView,
  type AutonomyReason,
  type CompensationState,
  type DecisionDisposition,
  type DecisionRecord,
  type DecisionRecordRepository,
  type ExecutionOutcome,
  type ImpactBand,
  type RiskLevel,
} from "@knowget/decision-intelligence";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface DecisionRecordRow {
  id: string;
  tenantId: string;
  organizationId: string;
  recommendationId: string;
  disposition: string;
  decidedByUserId: string | null;
  decidedAt: string;
  decisionNote: string | null;
  confidenceAtDecision: number;
  riskLevelAtDecision: string;
  impactBandAtDecision: string;
  evidenceIds: string[];
  autonomyReasons: string[];
  action: unknown;
  executionOutcome: string;
  executionRef: string | null;
  executionRequestedAt: string | null;
  executionSettledAt: string | null;
  executionError: string | null;
  compensationState: string;
  compensationRef: string | null;
  compensatedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: DecisionRecordRow): DecisionRecord {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    recommendationId: row.recommendationId as Uuid,
    disposition: row.disposition as DecisionDisposition,
    decidedByUserId: row.decidedByUserId,
    decidedAt: row.decidedAt as ISODateString,
    decisionNote: row.decisionNote,
    confidenceAtDecision: row.confidenceAtDecision,
    riskLevelAtDecision: row.riskLevelAtDecision as RiskLevel,
    impactBandAtDecision: row.impactBandAtDecision as ImpactBand,
    evidenceIds: row.evidenceIds,
    autonomyReasons: row.autonomyReasons as AutonomyReason[],
    action: (row.action as ActionView | null) ?? null,
    executionOutcome: row.executionOutcome as ExecutionOutcome,
    executionRef: row.executionRef,
    executionRequestedAt: (row.executionRequestedAt as ISODateString | null) ?? null,
    executionSettledAt: (row.executionSettledAt as ISODateString | null) ?? null,
    executionError: row.executionError,
    compensationState: row.compensationState as CompensationState,
    compensationRef: row.compensationRef,
    compensatedAt: (row.compensatedAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(decision: DecisionRecord) {
  return {
    tenantId: decision.tenantId,
    organizationId: decision.organizationId,
    recommendationId: decision.recommendationId,
    disposition: decision.disposition,
    decidedByUserId: decision.decidedByUserId,
    decidedAt: decision.decidedAt,
    decisionNote: decision.decisionNote,
    confidenceAtDecision: decision.confidenceAtDecision,
    riskLevelAtDecision: decision.riskLevelAtDecision,
    impactBandAtDecision: decision.impactBandAtDecision,
    evidenceIds: [...decision.evidenceIds],
    autonomyReasons: [...decision.autonomyReasons],
    action: decision.action === null ? null : JSON.parse(JSON.stringify(decision.action)),
    executionOutcome: decision.executionOutcome,
    executionRef: decision.executionRef,
    executionRequestedAt: decision.executionRequestedAt,
    executionSettledAt: decision.executionSettledAt,
    executionError: decision.executionError,
    compensationState: decision.compensationState,
    compensationRef: decision.compensationRef,
    compensatedAt: decision.compensatedAt,
  };
}

/**
 * Prisma-backed {@link DecisionRecordRepository} (RLS via {@link withTenant}).
 *
 * `listByRecommendation` returns a list rather than the single decision it looks like it should, because a
 * deferral is a decision and leaves the recommendation open: a recommendation deferred twice and then accepted
 * has three decisions behind it, and flattening that to the last one would lose the fact that it was put off.
 *
 * `listCompensationDue` is the sweep behind the contract's third rule, and it reads the derived
 * `compensation_state` rather than joining outcome to action — the reversal engine already decided what is
 * owed, and re-deriving it in SQL would be a second opinion that could disagree. The index on
 * (tenant_id, compensation_state) is what makes the morning queue a scan of one index.
 *
 * There is no `remove`. A decision is what an institution chose and who was accountable for it.
 */
export class PrismaDecisionRecordRepository implements DecisionRecordRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<DecisionRecord | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.decisionRecord.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  listByRecommendation(tenantId: TenantId, recommendationId: Uuid): Promise<DecisionRecord[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.decisionRecord.findMany({ where: { recommendationId } });
      return rows.map(toDomain);
    });
  }

  listCompensationDue(tenantId: TenantId): Promise<DecisionRecord[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.decisionRecord.findMany({ where: { compensationState: "available" } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<DecisionRecord[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.decisionRecord.findMany();
      return rows.map(toDomain);
    });
  }

  save(decision: DecisionRecord): Promise<void> {
    return withTenant(this.db, decision.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(decision);
      await tx.decisionRecord.upsert({
        where: { id: decision.id },
        create: { id: decision.id, ...fields },
        update: fields,
      });
    });
  }
}
