import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  ClinicalEncounter,
  EncounterDisposition,
  EncounterRepository,
  EncounterStatus,
  TriageAcuity,
} from "@knowget/health-centre";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

const OPEN = ["draft", "in_progress"];

interface EncounterRow {
  id: string;
  tenantId: string;
  organizationId: string;
  centreId: string;
  patientId: string;
  clinicianId: string | null;
  triageAcuity: string;
  chiefComplaint: string | null;
  assessment: string | null;
  disposition: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: EncounterRow): ClinicalEncounter {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    centreId: row.centreId as Uuid,
    patientId: row.patientId as Uuid,
    clinicianId: (row.clinicianId as Uuid | null) ?? null,
    triageAcuity: row.triageAcuity as TriageAcuity,
    chiefComplaint: row.chiefComplaint,
    assessment: row.assessment,
    disposition: (row.disposition as EncounterDisposition | null) ?? null,
    status: row.status as EncounterStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(encounter: ClinicalEncounter) {
  return {
    tenantId: encounter.tenantId,
    organizationId: encounter.organizationId,
    centreId: encounter.centreId,
    patientId: encounter.patientId,
    clinicianId: encounter.clinicianId,
    triageAcuity: encounter.triageAcuity,
    chiefComplaint: encounter.chiefComplaint,
    assessment: encounter.assessment,
    disposition: encounter.disposition,
    status: encounter.status,
  };
}

/** Prisma-backed {@link EncounterRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaEncounterRepository implements EncounterRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<ClinicalEncounter | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.clinicalEncounter.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByPatient(tenantId: TenantId, patientId: Uuid): Promise<ClinicalEncounter[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.clinicalEncounter.findMany({ where: { patientId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByCentre(tenantId: TenantId, centreId: Uuid): Promise<ClinicalEncounter[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.clinicalEncounter.findMany({ where: { centreId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listOpenByCentre(tenantId: TenantId, centreId: Uuid): Promise<ClinicalEncounter[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.clinicalEncounter.findMany({
        where: { centreId, status: { in: OPEN }, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<ClinicalEncounter[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.clinicalEncounter.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<ClinicalEncounter[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.clinicalEncounter.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(encounter: ClinicalEncounter): Promise<void> {
    return withTenant(this.db, encounter.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(encounter);
      await tx.clinicalEncounter.upsert({
        where: { id: encounter.id },
        create: { id: encounter.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.clinicalEncounter.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
