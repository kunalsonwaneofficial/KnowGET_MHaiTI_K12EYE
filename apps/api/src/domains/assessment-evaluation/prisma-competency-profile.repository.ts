import type {
  CompetencyMastery,
  CompetencyProfile,
  CompetencyProfileRepository,
  MasteryChange,
} from "@knowget/assessment-evaluation";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface CompetencyProfileRow {
  id: string;
  tenantId: string;
  organizationId: string;
  studentId: string;
  competencies: unknown;
  trajectory: unknown;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: CompetencyProfileRow): CompetencyProfile {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    studentId: row.studentId as Uuid,
    competencies: (row.competencies as CompetencyMastery[]) ?? [],
    trajectory: (row.trajectory as MasteryChange[]) ?? [],
    version: row.version,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(profile: CompetencyProfile) {
  return {
    tenantId: profile.tenantId,
    organizationId: profile.organizationId,
    studentId: profile.studentId,
    competencies: JSON.parse(JSON.stringify(profile.competencies)),
    trajectory: JSON.parse(JSON.stringify(profile.trajectory)),
    version: profile.version,
  };
}

/** Prisma-backed {@link CompetencyProfileRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaCompetencyProfileRepository implements CompetencyProfileRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<CompetencyProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.competencyProfile.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByStudent(tenantId: TenantId, studentId: Uuid): Promise<CompetencyProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.competencyProfile.findFirst({
        where: { studentId, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<CompetencyProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.competencyProfile.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<CompetencyProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.competencyProfile.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(profile: CompetencyProfile): Promise<void> {
    return withTenant(this.db, profile.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(profile);
      await tx.competencyProfile.upsert({
        where: { id: profile.id },
        create: { id: profile.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.competencyProfile.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
