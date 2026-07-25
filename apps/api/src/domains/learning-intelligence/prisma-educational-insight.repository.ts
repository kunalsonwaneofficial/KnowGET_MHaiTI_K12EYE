import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  EducationalInsight,
  EducationalInsightRepository,
  EvidenceRef,
  InsightCategory,
  InsightDimension,
  InsightEvent,
  InsightPriority,
  InsightStatus,
} from "@knowget/learning-intelligence";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface EducationalInsightRow {
  id: string;
  tenantId: string;
  organizationId: string;
  studentId: string;
  category: string;
  dimension: string | null;
  title: string;
  narrative: string;
  priority: string;
  evidence: unknown;
  status: string;
  history: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: EducationalInsightRow): EducationalInsight {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    studentId: row.studentId as Uuid,
    category: row.category as InsightCategory,
    dimension: row.dimension as InsightDimension | null,
    title: row.title,
    narrative: row.narrative,
    priority: row.priority as InsightPriority,
    evidence: (row.evidence as EvidenceRef[]) ?? [],
    status: row.status as InsightStatus,
    history: (row.history as InsightEvent[]) ?? [],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(insight: EducationalInsight) {
  return {
    tenantId: insight.tenantId,
    organizationId: insight.organizationId,
    studentId: insight.studentId,
    category: insight.category,
    dimension: insight.dimension,
    title: insight.title,
    narrative: insight.narrative,
    priority: insight.priority,
    evidence: JSON.parse(JSON.stringify(insight.evidence)),
    status: insight.status,
    history: JSON.parse(JSON.stringify(insight.history)),
  };
}

/** Prisma-backed {@link EducationalInsightRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaEducationalInsightRepository implements EducationalInsightRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<EducationalInsight | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.educationalInsight.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<EducationalInsight[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.educationalInsight.findMany({
        where: { studentId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<EducationalInsight[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.educationalInsight.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<EducationalInsight[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.educationalInsight.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(insight: EducationalInsight): Promise<void> {
    return withTenant(this.db, insight.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(insight);
      await tx.educationalInsight.upsert({
        where: { id: insight.id },
        create: { id: insight.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.educationalInsight.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
