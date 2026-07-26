import type { EnrollmentConfirmation, EnrollmentConfirmationRepository } from "@knowget/admissions";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface EnrollmentConfirmationRow {
  id: string;
  tenantId: string;
  organizationId: string;
  offerId: string;
  applicationId: string;
  cycleId: string;
  applicantPersonId: string;
  gradeConfirmed: string;
  studentId: string | null;
  confirmedOn: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: EnrollmentConfirmationRow): EnrollmentConfirmation {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    offerId: row.offerId as Uuid,
    applicationId: row.applicationId as Uuid,
    cycleId: row.cycleId as Uuid,
    applicantPersonId: row.applicantPersonId as Uuid,
    gradeConfirmed: row.gradeConfirmed,
    studentId: (row.studentId as Uuid | null) ?? null,
    confirmedOn: row.confirmedOn,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(confirmation: EnrollmentConfirmation) {
  return {
    tenantId: confirmation.tenantId,
    organizationId: confirmation.organizationId,
    offerId: confirmation.offerId,
    applicationId: confirmation.applicationId,
    cycleId: confirmation.cycleId,
    applicantPersonId: confirmation.applicantPersonId,
    gradeConfirmed: confirmation.gradeConfirmed,
    studentId: confirmation.studentId,
    confirmedOn: confirmation.confirmedOn,
  };
}

/**
 * Prisma-backed {@link EnrollmentConfirmationRepository} (RLS via {@link withTenant}). The confirmation is
 * immutable, so there is no `remove`. The one-per-offer rule is DB-backed by a unique index; `findByOffer` is
 * the service's fast pre-check.
 */
export class PrismaEnrollmentConfirmationRepository implements EnrollmentConfirmationRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<EnrollmentConfirmation | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.enrollmentConfirmation.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByOffer(tenantId: TenantId, offerId: Uuid): Promise<EnrollmentConfirmation | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.enrollmentConfirmation.findFirst({
        where: { offerId, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByCycle(tenantId: TenantId, cycleId: Uuid): Promise<EnrollmentConfirmation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.enrollmentConfirmation.findMany({
        where: { cycleId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  countByCycle(tenantId: TenantId, cycleId: Uuid): Promise<number> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      return tx.enrollmentConfirmation.count({ where: { cycleId, deletedAt: null } });
    });
  }

  listByTenant(tenantId: TenantId): Promise<EnrollmentConfirmation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.enrollmentConfirmation.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(confirmation: EnrollmentConfirmation): Promise<void> {
    return withTenant(this.db, confirmation.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(confirmation);
      await tx.enrollmentConfirmation.upsert({
        where: { id: confirmation.id },
        create: { id: confirmation.id, ...fields },
        update: fields,
      });
    });
  }
}
