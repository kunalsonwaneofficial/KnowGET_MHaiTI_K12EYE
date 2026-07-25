import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  CohortInsight,
  CohortInsightRepository,
  CohortInsightStatus,
  CohortScopeType,
  RiskBand,
} from "@knowget/learning-intelligence";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface CohortInsightRow {
  id: string;
  tenantId: string;
  organizationId: string;
  scopeType: string;
  scopeId: string;
  label: string;
  memberStudentIds: unknown;
  learnersConsidered: number;
  averageLearningHealth: number;
  averageBand: string;
  bandDistribution: unknown;
  learnersNeedingAttention: number;
  status: string;
  version: number;
  generatedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: CohortInsightRow): CohortInsight {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    scopeType: row.scopeType as CohortScopeType,
    scopeId: row.scopeId as Uuid,
    label: row.label,
    memberStudentIds: (row.memberStudentIds as Uuid[]) ?? [],
    learnersConsidered: row.learnersConsidered,
    averageLearningHealth: row.averageLearningHealth,
    averageBand: row.averageBand as RiskBand,
    bandDistribution: (row.bandDistribution as Record<RiskBand, number>) ?? {
      on_track: 0,
      watch: 0,
      at_risk: 0,
      critical: 0,
    },
    learnersNeedingAttention: row.learnersNeedingAttention,
    status: row.status as CohortInsightStatus,
    version: row.version,
    generatedAt: row.generatedAt,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(insight: CohortInsight) {
  return {
    tenantId: insight.tenantId,
    organizationId: insight.organizationId,
    scopeType: insight.scopeType,
    scopeId: insight.scopeId,
    label: insight.label,
    memberStudentIds: JSON.parse(JSON.stringify(insight.memberStudentIds)),
    learnersConsidered: insight.learnersConsidered,
    averageLearningHealth: insight.averageLearningHealth,
    averageBand: insight.averageBand,
    bandDistribution: JSON.parse(JSON.stringify(insight.bandDistribution)),
    learnersNeedingAttention: insight.learnersNeedingAttention,
    status: insight.status,
    version: insight.version,
    generatedAt: insight.generatedAt,
  };
}

/** Prisma-backed {@link CohortInsightRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaCohortInsightRepository implements CohortInsightRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<CohortInsight | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.cohortInsight.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByScope(
    tenantId: TenantId,
    scopeType: CohortScopeType,
    scopeId: Uuid,
  ): Promise<CohortInsight | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.cohortInsight.findFirst({
        where: { scopeType, scopeId, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<CohortInsight[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.cohortInsight.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<CohortInsight[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.cohortInsight.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(insight: CohortInsight): Promise<void> {
    return withTenant(this.db, insight.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(insight);
      await tx.cohortInsight.upsert({
        where: { id: insight.id },
        create: { id: insight.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.cohortInsight.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
