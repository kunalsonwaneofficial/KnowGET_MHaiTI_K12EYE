import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type ImpactBand,
  type Recommendation,
  type RecommendationEvidence,
  type RecommendationRepository,
  type RecommendationStatus,
  type RiskLevel,
} from "@knowget/decision-intelligence";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface RecommendationRow {
  id: string;
  tenantId: string;
  organizationId: string;
  title: string;
  summary: string | null;
  subjectDomain: string;
  subjectId: string;
  impactBand: string;
  riskLevel: string;
  requiresHumanJudgement: boolean;
  status: string;
  evidence: unknown;
  confidence: number;
  proposedByUserId: string | null;
  raisedByRuleId: string | null;
  resolvedByUserId: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  supersededById: string | null;
  expiresAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: RecommendationRow): Recommendation {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    title: row.title,
    summary: row.summary,
    subjectDomain: row.subjectDomain,
    subjectId: row.subjectId,
    impactBand: row.impactBand as ImpactBand,
    riskLevel: row.riskLevel as RiskLevel,
    requiresHumanJudgement: row.requiresHumanJudgement,
    status: row.status as RecommendationStatus,
    evidence: (row.evidence as RecommendationEvidence[]) ?? [],
    confidence: row.confidence,
    proposedByUserId: row.proposedByUserId,
    raisedByRuleId: row.raisedByRuleId,
    resolvedByUserId: row.resolvedByUserId,
    resolvedAt: (row.resolvedAt as ISODateString | null) ?? null,
    resolutionNote: row.resolutionNote,
    supersededById: (row.supersededById as Uuid | null) ?? null,
    expiresAt: (row.expiresAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(recommendation: Recommendation) {
  return {
    tenantId: recommendation.tenantId,
    organizationId: recommendation.organizationId,
    title: recommendation.title,
    summary: recommendation.summary,
    subjectDomain: recommendation.subjectDomain,
    subjectId: recommendation.subjectId,
    impactBand: recommendation.impactBand,
    riskLevel: recommendation.riskLevel,
    requiresHumanJudgement: recommendation.requiresHumanJudgement,
    status: recommendation.status,
    evidence: JSON.parse(JSON.stringify(recommendation.evidence)),
    confidence: recommendation.confidence,
    proposedByUserId: recommendation.proposedByUserId,
    raisedByRuleId: recommendation.raisedByRuleId,
    resolvedByUserId: recommendation.resolvedByUserId,
    resolvedAt: recommendation.resolvedAt,
    resolutionNote: recommendation.resolutionNote,
    supersededById: recommendation.supersededById,
    expiresAt: recommendation.expiresAt,
  };
}

/**
 * Prisma-backed {@link RecommendationRepository} (RLS via {@link withTenant}).
 *
 * The evidence chain lives in the recommendation's own JSONB column and is loaded and saved with it, never
 * apart. The contract's second rule is that a recommendation ships with its evidence, and a chain that can be
 * written on its own is a chain that can be written *after* — which is exactly the gap between "grounded" and
 * "grounded eventually" that the rule exists to close. Confidence is stored beside it rather than recomputed
 * on read, because what a decision rested on is a fact about the past: the chain may grow afterwards, and the
 * grounds a decision was taken on may not.
 *
 * There is no `remove`. A recommendation is the record of what was proposed, and a rejected one the record
 * that somebody looked and said no; the aggregate's own exits — withdrawn, superseded, expired — are what a
 * delete would otherwise be reached for, and they leave the history intact.
 */
export class PrismaRecommendationRepository implements RecommendationRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Recommendation | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.decisionRecommendation.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  listBySubject(
    tenantId: TenantId,
    subjectDomain: string,
    subjectId: string,
  ): Promise<Recommendation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.decisionRecommendation.findMany({
        where: { subjectDomain, subjectId },
      });
      return rows.map(toDomain);
    });
  }

  listOpen(tenantId: TenantId): Promise<Recommendation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.decisionRecommendation.findMany({ where: { status: "proposed" } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Recommendation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.decisionRecommendation.findMany();
      return rows.map(toDomain);
    });
  }

  save(recommendation: Recommendation): Promise<void> {
    return withTenant(this.db, recommendation.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(recommendation);
      await tx.decisionRecommendation.upsert({
        where: { id: recommendation.id },
        create: { id: recommendation.id, ...fields },
        update: fields,
      });
    });
  }
}
