import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  FacultyProfile,
  FacultyProfileRepository,
  FacultyProfileStatus,
  GrowthBand,
} from "@knowget/faculty-excellence";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface FacultyProfileRow {
  id: string;
  tenantId: string;
  organizationId: string;
  employeeId: string;
  observationsConsidered: number;
  averageObservationRating: number | null;
  competenciesObserved: number;
  goalsTotal: number;
  goalsAchieved: number;
  goalProgressPct: number;
  developmentComplianceRate: number;
  growthBand: string;
  status: string;
  version: number;
  lastRefreshedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: FacultyProfileRow): FacultyProfile {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    employeeId: row.employeeId as Uuid,
    observationsConsidered: row.observationsConsidered,
    averageObservationRating: row.averageObservationRating,
    competenciesObserved: row.competenciesObserved,
    goalsTotal: row.goalsTotal,
    goalsAchieved: row.goalsAchieved,
    goalProgressPct: row.goalProgressPct,
    developmentComplianceRate: row.developmentComplianceRate,
    growthBand: row.growthBand as GrowthBand,
    status: row.status as FacultyProfileStatus,
    version: row.version,
    lastRefreshedAt: row.lastRefreshedAt,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(profile: FacultyProfile) {
  return {
    tenantId: profile.tenantId,
    organizationId: profile.organizationId,
    employeeId: profile.employeeId,
    observationsConsidered: profile.observationsConsidered,
    averageObservationRating: profile.averageObservationRating,
    competenciesObserved: profile.competenciesObserved,
    goalsTotal: profile.goalsTotal,
    goalsAchieved: profile.goalsAchieved,
    goalProgressPct: profile.goalProgressPct,
    developmentComplianceRate: profile.developmentComplianceRate,
    growthBand: profile.growthBand,
    status: profile.status,
    version: profile.version,
    lastRefreshedAt: profile.lastRefreshedAt,
  };
}

/** Prisma-backed {@link FacultyProfileRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaFacultyProfileRepository implements FacultyProfileRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<FacultyProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.facultyProfile.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<FacultyProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.facultyProfile.findFirst({ where: { employeeId, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<FacultyProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.facultyProfile.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<FacultyProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.facultyProfile.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(profile: FacultyProfile): Promise<void> {
    return withTenant(this.db, profile.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(profile);
      await tx.facultyProfile.upsert({
        where: { id: profile.id },
        create: { id: profile.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.facultyProfile.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
