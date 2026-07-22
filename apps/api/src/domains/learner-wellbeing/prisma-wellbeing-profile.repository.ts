import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  SuccessMetric,
  WellbeingDimensions,
  WellbeingIndicators,
  WellbeingProfile,
  WellbeingProfileRepository,
} from "@knowget/learner-wellbeing";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface WellbeingProfileRow {
  id: string;
  tenantId: string;
  organizationId: string;
  studentId: string;
  dimensions: unknown;
  learningSupportIndicators: string[];
  successMetrics: unknown;
  indicators: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: WellbeingProfileRow): WellbeingProfile {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    studentId: row.studentId as Uuid,
    dimensions: row.dimensions as WellbeingDimensions,
    learningSupportIndicators: [...(row.learningSupportIndicators ?? [])],
    successMetrics: (row.successMetrics as SuccessMetric[]) ?? [],
    indicators: row.indicators as WellbeingIndicators,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(profile: WellbeingProfile) {
  return {
    tenantId: profile.tenantId,
    organizationId: profile.organizationId,
    studentId: profile.studentId,
    dimensions: JSON.parse(JSON.stringify(profile.dimensions)),
    learningSupportIndicators: [...profile.learningSupportIndicators],
    successMetrics: JSON.parse(JSON.stringify(profile.successMetrics)),
    indicators: JSON.parse(JSON.stringify(profile.indicators)),
  };
}

/** Prisma-backed {@link WellbeingProfileRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaWellbeingProfileRepository implements WellbeingProfileRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<WellbeingProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.wellbeingProfile.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByStudent(tenantId: TenantId, studentId: Uuid): Promise<WellbeingProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.wellbeingProfile.findFirst({ where: { studentId, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<WellbeingProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.wellbeingProfile.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<WellbeingProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.wellbeingProfile.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(profile: WellbeingProfile): Promise<void> {
    return withTenant(this.db, profile.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(profile);
      await tx.wellbeingProfile.upsert({
        where: { id: profile.id },
        create: { id: profile.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.wellbeingProfile.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
