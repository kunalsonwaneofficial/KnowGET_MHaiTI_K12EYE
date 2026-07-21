import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  Consent,
  ConsentDecision,
  ConsentRepository,
  ConsentType,
} from "@knowget/family-guardian";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface ConsentRow {
  id: string;
  tenantId: string;
  organizationId: string;
  studentId: string;
  guardianId: string;
  consentType: string;
  decision: string;
  version: number;
  policyId: string | null;
  note: string | null;
  effectiveOn: Date;
  expiresOn: Date | null;
  recordedAt: Date;
}

function toDomain(row: ConsentRow): Consent {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    studentId: row.studentId as Uuid,
    guardianId: row.guardianId as Uuid,
    consentType: row.consentType as ConsentType,
    decision: row.decision as ConsentDecision,
    version: row.version,
    policyId: (row.policyId as Uuid | null) ?? null,
    note: row.note,
    effectiveOn: row.effectiveOn.toISOString().slice(0, 10),
    expiresOn: row.expiresOn ? row.expiresOn.toISOString().slice(0, 10) : null,
    recordedAt: toIso(row.recordedAt) as ISODateString,
  };
}

/**
 * Prisma-backed {@link ConsentRepository} (RLS via {@link withTenant}). Append-only:
 * `save` inserts a new immutable versioned record; there is no update or delete.
 */
export class PrismaFamilyConsentRepository implements ConsentRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Consent | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.familyConsent.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  findLatest(
    tenantId: TenantId,
    studentId: Uuid,
    consentType: ConsentType,
  ): Promise<Consent | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.familyConsent.findFirst({
        where: { studentId, consentType },
        orderBy: { version: "desc" },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<Consent[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.familyConsent.findMany({ where: { studentId } });
      return rows.map(toDomain);
    });
  }

  listByStudentAndType(
    tenantId: TenantId,
    studentId: Uuid,
    consentType: ConsentType,
  ): Promise<Consent[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.familyConsent.findMany({ where: { studentId, consentType } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Consent[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.familyConsent.findMany();
      return rows.map(toDomain);
    });
  }

  save(consent: Consent): Promise<void> {
    return withTenant(this.db, consent.tenantId, async (tx: TransactionClient) => {
      await tx.familyConsent.create({
        data: {
          id: consent.id,
          tenantId: consent.tenantId,
          organizationId: consent.organizationId,
          studentId: consent.studentId,
          guardianId: consent.guardianId,
          consentType: consent.consentType,
          decision: consent.decision,
          version: consent.version,
          policyId: consent.policyId,
          note: consent.note,
          effectiveOn: new Date(consent.effectiveOn),
          expiresOn: consent.expiresOn ? new Date(consent.expiresOn) : null,
          recordedAt: new Date(consent.recordedAt),
        },
      });
    });
  }
}
