import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type {
  IntelligenceIndicators,
  IntelligenceProfile,
  IntelligenceProfileRepository,
  InterventionRecord,
} from "@knowget/student-lifecycle";
import type { TenantId, Uuid } from "@knowget/types";

interface ProfileRow {
  id: string;
  tenantId: string;
  studentId: string;
  organizationId: string;
  indicators: unknown;
  interventions: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ProfileRow): IntelligenceProfile {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    studentId: row.studentId as Uuid,
    organizationId: row.organizationId as Uuid,
    indicators: (row.indicators as IntelligenceIndicators) ?? {
      academicRisk: null,
      academicTrajectory: null,
      attendanceTrend: null,
      behaviourTrend: null,
      engagement: null,
      wellbeing: null,
    },
    interventions: (row.interventions as InterventionRecord[]) ?? [],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(profile: IntelligenceProfile) {
  return {
    tenantId: profile.tenantId,
    studentId: profile.studentId,
    organizationId: profile.organizationId,
    indicators: JSON.parse(JSON.stringify(profile.indicators)),
    interventions: JSON.parse(JSON.stringify(profile.interventions)),
  };
}

/** Prisma-backed {@link IntelligenceProfileRepository} (RLS via {@link withTenant}). */
export class PrismaStudentIntelligenceRepository implements IntelligenceProfileRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<IntelligenceProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.studentIntelligenceProfile.findFirst({
        where: { id, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  findByStudent(tenantId: TenantId, studentId: Uuid): Promise<IntelligenceProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.studentIntelligenceProfile.findFirst({
        where: { studentId, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByTenant(tenantId: TenantId): Promise<IntelligenceProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.studentIntelligenceProfile.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(profile: IntelligenceProfile): Promise<void> {
    return withTenant(this.db, profile.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(profile);
      await tx.studentIntelligenceProfile.upsert({
        where: { id: profile.id },
        create: { id: profile.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.studentIntelligenceProfile.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
  }
}
