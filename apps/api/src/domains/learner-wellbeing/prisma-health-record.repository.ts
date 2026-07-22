import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  Allergy,
  ChronicCondition,
  HealthRecord,
  HealthRecordRepository,
  Immunization,
  MedicalAlert,
  Medication,
} from "@knowget/learner-wellbeing";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface HealthRecordRow {
  id: string;
  tenantId: string;
  organizationId: string;
  studentId: string;
  medicalHistory: string | null;
  bloodGroup: string | null;
  allergies: unknown;
  chronicConditions: unknown;
  immunizations: unknown;
  medications: unknown;
  medicalAlerts: unknown;
  emergencyPlan: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: HealthRecordRow): HealthRecord {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    studentId: row.studentId as Uuid,
    medicalHistory: row.medicalHistory,
    bloodGroup: row.bloodGroup,
    allergies: (row.allergies as Allergy[]) ?? [],
    chronicConditions: (row.chronicConditions as ChronicCondition[]) ?? [],
    immunizations: (row.immunizations as Immunization[]) ?? [],
    medications: (row.medications as Medication[]) ?? [],
    medicalAlerts: (row.medicalAlerts as MedicalAlert[]) ?? [],
    emergencyPlan: row.emergencyPlan,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(record: HealthRecord) {
  return {
    tenantId: record.tenantId,
    organizationId: record.organizationId,
    studentId: record.studentId,
    medicalHistory: record.medicalHistory,
    bloodGroup: record.bloodGroup,
    allergies: JSON.parse(JSON.stringify(record.allergies)),
    chronicConditions: JSON.parse(JSON.stringify(record.chronicConditions)),
    immunizations: JSON.parse(JSON.stringify(record.immunizations)),
    medications: JSON.parse(JSON.stringify(record.medications)),
    medicalAlerts: JSON.parse(JSON.stringify(record.medicalAlerts)),
    emergencyPlan: record.emergencyPlan,
  };
}

/** Prisma-backed {@link HealthRecordRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaHealthRecordRepository implements HealthRecordRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<HealthRecord | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.healthRecord.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByStudent(tenantId: TenantId, studentId: Uuid): Promise<HealthRecord | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.healthRecord.findFirst({ where: { studentId, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<HealthRecord[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.healthRecord.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<HealthRecord[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.healthRecord.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(record: HealthRecord): Promise<void> {
    return withTenant(this.db, record.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(record);
      await tx.healthRecord.upsert({
        where: { id: record.id },
        create: { id: record.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.healthRecord.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
