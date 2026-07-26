import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  Prescription,
  PrescriptionRepository,
  PrescriptionStatus,
} from "@knowget/health-centre";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface PrescriptionRow {
  id: string;
  tenantId: string;
  organizationId: string;
  centreId: string;
  patientId: string;
  clinicianId: string;
  medication: string;
  dosage: string | null;
  frequencyPerDay: number;
  durationDays: number;
  dosesAdministered: number;
  startDate: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: PrescriptionRow): Prescription {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    centreId: row.centreId as Uuid,
    patientId: row.patientId as Uuid,
    clinicianId: row.clinicianId as Uuid,
    medication: row.medication,
    dosage: row.dosage,
    frequencyPerDay: row.frequencyPerDay,
    durationDays: row.durationDays,
    dosesAdministered: row.dosesAdministered,
    startDate: row.startDate,
    status: row.status as PrescriptionStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(prescription: Prescription) {
  return {
    tenantId: prescription.tenantId,
    organizationId: prescription.organizationId,
    centreId: prescription.centreId,
    patientId: prescription.patientId,
    clinicianId: prescription.clinicianId,
    medication: prescription.medication,
    dosage: prescription.dosage,
    frequencyPerDay: prescription.frequencyPerDay,
    durationDays: prescription.durationDays,
    dosesAdministered: prescription.dosesAdministered,
    startDate: prescription.startDate,
    status: prescription.status,
  };
}

/** Prisma-backed {@link PrescriptionRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaPrescriptionRepository implements PrescriptionRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Prescription | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.prescription.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByPatient(tenantId: TenantId, patientId: Uuid): Promise<Prescription[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.prescription.findMany({ where: { patientId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByCentre(tenantId: TenantId, centreId: Uuid): Promise<Prescription[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.prescription.findMany({ where: { centreId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listActiveByCentre(tenantId: TenantId, centreId: Uuid): Promise<Prescription[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.prescription.findMany({
        where: { centreId, status: "active", deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Prescription[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.prescription.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Prescription[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.prescription.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(prescription: Prescription): Promise<void> {
    return withTenant(this.db, prescription.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(prescription);
      await tx.prescription.upsert({
        where: { id: prescription.id },
        create: { id: prescription.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.prescription.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
