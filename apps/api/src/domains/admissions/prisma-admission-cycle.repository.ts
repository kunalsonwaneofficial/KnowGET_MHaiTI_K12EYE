import type {
  AdmissionCycle,
  AdmissionCycleRepository,
  CycleStatus,
  GradeCapacity,
} from "@knowget/admissions";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface AdmissionCycleRow {
  id: string;
  tenantId: string;
  organizationId: string;
  code: string;
  name: string;
  academicYear: string;
  gradeCapacities: unknown;
  opensOn: string | null;
  closesOn: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AdmissionCycleRow): AdmissionCycle {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    code: row.code,
    name: row.name,
    academicYear: row.academicYear,
    gradeCapacities: (row.gradeCapacities as GradeCapacity[] | null) ?? [],
    opensOn: row.opensOn,
    closesOn: row.closesOn,
    status: row.status as CycleStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(cycle: AdmissionCycle) {
  return {
    tenantId: cycle.tenantId,
    organizationId: cycle.organizationId,
    code: cycle.code,
    name: cycle.name,
    academicYear: cycle.academicYear,
    // Serialize to a plain JSON value for the JSONB column.
    gradeCapacities: JSON.parse(JSON.stringify(cycle.gradeCapacities)),
    opensOn: cycle.opensOn,
    closesOn: cycle.closesOn,
    status: cycle.status,
  };
}

/** Prisma-backed {@link AdmissionCycleRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaAdmissionCycleRepository implements AdmissionCycleRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<AdmissionCycle | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.admissionCycle.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, code: string): Promise<AdmissionCycle | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.admissionCycle.findFirst({ where: { code, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AdmissionCycle[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.admissionCycle.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<AdmissionCycle[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.admissionCycle.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(cycle: AdmissionCycle): Promise<void> {
    return withTenant(this.db, cycle.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(cycle);
      await tx.admissionCycle.upsert({
        where: { id: cycle.id },
        create: { id: cycle.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.admissionCycle.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
