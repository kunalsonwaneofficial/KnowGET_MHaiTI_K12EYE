import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  EvidenceRef,
  InsightDimension,
  InsightEvent,
  InsightPriority,
  Recommendation,
  RecommendationCategory,
  RecommendationRepository,
  RecommendationStatus,
} from "@knowget/learning-intelligence";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface RecommendationRow {
  id: string;
  tenantId: string;
  organizationId: string;
  studentId: string;
  category: string;
  action: string;
  rationale: string;
  priority: string;
  targetDimension: string | null;
  evidence: unknown;
  status: string;
  decidedBy: string | null;
  history: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: RecommendationRow): Recommendation {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    studentId: row.studentId as Uuid,
    category: row.category as RecommendationCategory,
    action: row.action,
    rationale: row.rationale,
    priority: row.priority as InsightPriority,
    targetDimension: row.targetDimension as InsightDimension | null,
    evidence: (row.evidence as EvidenceRef[]) ?? [],
    status: row.status as RecommendationStatus,
    decidedBy: row.decidedBy as Uuid | null,
    history: (row.history as InsightEvent[]) ?? [],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(recommendation: Recommendation) {
  return {
    tenantId: recommendation.tenantId,
    organizationId: recommendation.organizationId,
    studentId: recommendation.studentId,
    category: recommendation.category,
    action: recommendation.action,
    rationale: recommendation.rationale,
    priority: recommendation.priority,
    targetDimension: recommendation.targetDimension,
    evidence: JSON.parse(JSON.stringify(recommendation.evidence)),
    status: recommendation.status,
    decidedBy: recommendation.decidedBy,
    history: JSON.parse(JSON.stringify(recommendation.history)),
  };
}

/** Prisma-backed {@link RecommendationRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaRecommendationRepository implements RecommendationRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Recommendation | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.recommendation.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<Recommendation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.recommendation.findMany({ where: { studentId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Recommendation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.recommendation.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Recommendation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.recommendation.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(recommendation: Recommendation): Promise<void> {
    return withTenant(this.db, recommendation.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(recommendation);
      await tx.recommendation.upsert({
        where: { id: recommendation.id },
        create: { id: recommendation.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.recommendation.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
