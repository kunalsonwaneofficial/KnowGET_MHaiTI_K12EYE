import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  Clinician,
  ClinicianRepository,
  ClinicianRole,
  ClinicianStatus,
} from "@knowget/health-centre";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface ClinicianRow {
  id: string;
  tenantId: string;
  organizationId: string;
  employeeId: string;
  role: string;
  registrationNumber: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ClinicianRow): Clinician {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    employeeId: row.employeeId as Uuid,
    role: row.role as ClinicianRole,
    registrationNumber: row.registrationNumber,
    status: row.status as ClinicianStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(clinician: Clinician) {
  return {
    tenantId: clinician.tenantId,
    organizationId: clinician.organizationId,
    employeeId: clinician.employeeId,
    role: clinician.role,
    registrationNumber: clinician.registrationNumber,
    status: clinician.status,
  };
}

/** Prisma-backed {@link ClinicianRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaClinicianRepository implements ClinicianRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Clinician | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.clinician.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<Clinician | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.clinician.findFirst({ where: { employeeId, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Clinician[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.clinician.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Clinician[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.clinician.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(clinician: Clinician): Promise<void> {
    return withTenant(this.db, clinician.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(clinician);
      await tx.clinician.upsert({
        where: { id: clinician.id },
        create: { id: clinician.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.clinician.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
