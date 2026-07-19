import { Prisma } from "@prisma/client";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type {
  AdmissionDecision,
  Applicant,
  ApplicantRepository,
  ApplicantStatus,
  ApplicationDocument,
  ApplicationInterview,
} from "@knowget/student-lifecycle";
import type { TenantId, Uuid } from "@knowget/types";

interface ApplicantRow {
  id: string;
  tenantId: string;
  organizationId: string;
  personId: string;
  prospectId: string | null;
  programId: string | null;
  status: string;
  documents: unknown;
  interview: unknown;
  decision: unknown;
  submittedOn: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const toDate = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

const fromDate = (value: string | null): Date | null => (value ? new Date(value) : null);

function toDomain(row: ApplicantRow): Applicant {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    personId: row.personId as Uuid,
    prospectId: row.prospectId as Uuid | null,
    programId: row.programId as Uuid | null,
    status: row.status as ApplicantStatus,
    documents: (row.documents as ApplicationDocument[]) ?? [],
    interview: (row.interview as ApplicationInterview | null) ?? null,
    decision: (row.decision as AdmissionDecision | null) ?? null,
    submittedOn: toDate(row.submittedOn),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(applicant: Applicant) {
  return {
    tenantId: applicant.tenantId,
    organizationId: applicant.organizationId,
    personId: applicant.personId,
    prospectId: applicant.prospectId,
    programId: applicant.programId,
    status: applicant.status,
    documents: JSON.parse(JSON.stringify(applicant.documents)),
    interview: applicant.interview
      ? JSON.parse(JSON.stringify(applicant.interview))
      : Prisma.DbNull,
    decision: applicant.decision ? JSON.parse(JSON.stringify(applicant.decision)) : Prisma.DbNull,
    submittedOn: fromDate(applicant.submittedOn),
  };
}

/** Prisma-backed {@link ApplicantRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaStudentApplicantRepository implements ApplicantRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Applicant | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.studentApplicant.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Applicant[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.studentApplicant.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Applicant[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.studentApplicant.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(applicant: Applicant): Promise<void> {
    return withTenant(this.db, applicant.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(applicant);
      await tx.studentApplicant.upsert({
        where: { id: applicant.id },
        create: { id: applicant.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.studentApplicant.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
