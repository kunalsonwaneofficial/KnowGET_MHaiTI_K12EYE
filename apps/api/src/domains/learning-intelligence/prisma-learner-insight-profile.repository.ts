import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  DimensionScore,
  InsightProfileStatus,
  LearnerInsightProfile,
  LearnerInsightProfileRepository,
  RiskBand,
} from "@knowget/learning-intelligence";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface LearnerInsightProfileRow {
  id: string;
  tenantId: string;
  organizationId: string;
  studentId: string;
  overallScore: number;
  overallBand: string;
  dimensions: unknown;
  signalsConsidered: number;
  dimensionsCovered: number;
  status: string;
  version: number;
  lastSynthesizedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: LearnerInsightProfileRow): LearnerInsightProfile {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    studentId: row.studentId as Uuid,
    overallScore: row.overallScore,
    overallBand: row.overallBand as RiskBand,
    dimensions: (row.dimensions as DimensionScore[]) ?? [],
    signalsConsidered: row.signalsConsidered,
    dimensionsCovered: row.dimensionsCovered,
    status: row.status as InsightProfileStatus,
    version: row.version,
    lastSynthesizedAt: row.lastSynthesizedAt,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(profile: LearnerInsightProfile) {
  return {
    tenantId: profile.tenantId,
    organizationId: profile.organizationId,
    studentId: profile.studentId,
    overallScore: profile.overallScore,
    overallBand: profile.overallBand,
    dimensions: JSON.parse(JSON.stringify(profile.dimensions)),
    signalsConsidered: profile.signalsConsidered,
    dimensionsCovered: profile.dimensionsCovered,
    status: profile.status,
    version: profile.version,
    lastSynthesizedAt: profile.lastSynthesizedAt,
  };
}

/** Prisma-backed {@link LearnerInsightProfileRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaLearnerInsightProfileRepository implements LearnerInsightProfileRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<LearnerInsightProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.learnerInsightProfile.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByStudent(tenantId: TenantId, studentId: Uuid): Promise<LearnerInsightProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.learnerInsightProfile.findFirst({
        where: { studentId, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<LearnerInsightProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.learnerInsightProfile.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<LearnerInsightProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.learnerInsightProfile.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(profile: LearnerInsightProfile): Promise<void> {
    return withTenant(this.db, profile.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(profile);
      await tx.learnerInsightProfile.upsert({
        where: { id: profile.id },
        create: { id: profile.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.learnerInsightProfile.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
