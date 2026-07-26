import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  AdmissionRepository,
  AdmissionStatus,
  SickBayAdmission,
} from "@knowget/health-centre";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface AdmissionRow {
  id: string;
  tenantId: string;
  organizationId: string;
  centreId: string;
  patientId: string;
  bedLabel: string;
  admittedOn: string;
  reason: string | null;
  dischargedOn: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AdmissionRow): SickBayAdmission {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    centreId: row.centreId as Uuid,
    patientId: row.patientId as Uuid,
    bedLabel: row.bedLabel,
    admittedOn: row.admittedOn,
    reason: row.reason,
    dischargedOn: row.dischargedOn,
    status: row.status as AdmissionStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(admission: SickBayAdmission) {
  return {
    tenantId: admission.tenantId,
    organizationId: admission.organizationId,
    centreId: admission.centreId,
    patientId: admission.patientId,
    bedLabel: admission.bedLabel,
    admittedOn: admission.admittedOn,
    reason: admission.reason,
    dischargedOn: admission.dischargedOn,
    status: admission.status,
  };
}

/** Prisma-backed {@link AdmissionRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaAdmissionRepository implements AdmissionRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<SickBayAdmission | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.sickBayAdmission.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findActiveByBed(
    tenantId: TenantId,
    centreId: Uuid,
    bedLabel: string,
  ): Promise<SickBayAdmission | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.sickBayAdmission.findFirst({
        where: { centreId, bedLabel, status: "active", deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  findActiveByPatient(tenantId: TenantId, patientId: Uuid): Promise<SickBayAdmission | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.sickBayAdmission.findFirst({
        where: { patientId, status: "active", deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listActiveByCentre(tenantId: TenantId, centreId: Uuid): Promise<SickBayAdmission[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.sickBayAdmission.findMany({
        where: { centreId, status: "active", deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByCentre(tenantId: TenantId, centreId: Uuid): Promise<SickBayAdmission[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.sickBayAdmission.findMany({ where: { centreId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByPatient(tenantId: TenantId, patientId: Uuid): Promise<SickBayAdmission[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.sickBayAdmission.findMany({ where: { patientId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<SickBayAdmission[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.sickBayAdmission.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<SickBayAdmission[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.sickBayAdmission.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(admission: SickBayAdmission): Promise<void> {
    return withTenant(this.db, admission.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(admission);
      await tx.sickBayAdmission.upsert({
        where: { id: admission.id },
        create: { id: admission.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.sickBayAdmission.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
