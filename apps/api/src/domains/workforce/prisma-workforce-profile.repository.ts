import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";
import type {
  AttritionRiskBand,
  EmploymentStatus,
  WorkforceProfile,
  WorkforceProfileRepository,
  WorkforceProfileStatus,
} from "@knowget/workforce";

interface WorkforceProfileRow {
  id: string;
  tenantId: string;
  organizationId: string;
  employeeId: string;
  tenureMonths: number;
  employmentStatus: string;
  leaveUtilizationRate: number;
  reviewsFinalized: number;
  averageReviewRating: number | null;
  attritionRiskBand: string;
  status: string;
  version: number;
  lastRefreshedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: WorkforceProfileRow): WorkforceProfile {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    employeeId: row.employeeId as Uuid,
    tenureMonths: row.tenureMonths,
    employmentStatus: row.employmentStatus as EmploymentStatus,
    leaveUtilizationRate: row.leaveUtilizationRate,
    reviewsFinalized: row.reviewsFinalized,
    averageReviewRating: row.averageReviewRating,
    attritionRiskBand: row.attritionRiskBand as AttritionRiskBand,
    status: row.status as WorkforceProfileStatus,
    version: row.version,
    lastRefreshedAt: row.lastRefreshedAt,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(profile: WorkforceProfile) {
  return {
    tenantId: profile.tenantId,
    organizationId: profile.organizationId,
    employeeId: profile.employeeId,
    tenureMonths: profile.tenureMonths,
    employmentStatus: profile.employmentStatus,
    leaveUtilizationRate: profile.leaveUtilizationRate,
    reviewsFinalized: profile.reviewsFinalized,
    averageReviewRating: profile.averageReviewRating,
    attritionRiskBand: profile.attritionRiskBand,
    status: profile.status,
    version: profile.version,
    lastRefreshedAt: profile.lastRefreshedAt,
  };
}

/** Prisma-backed {@link WorkforceProfileRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaWorkforceProfileRepository implements WorkforceProfileRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<WorkforceProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.workforceProfile.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<WorkforceProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.workforceProfile.findFirst({
        where: { employeeId, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<WorkforceProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.workforceProfile.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<WorkforceProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.workforceProfile.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(profile: WorkforceProfile): Promise<void> {
    return withTenant(this.db, profile.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(profile);
      await tx.workforceProfile.upsert({
        where: { id: profile.id },
        create: { id: profile.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.workforceProfile.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
