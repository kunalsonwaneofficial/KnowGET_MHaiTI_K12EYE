import type {
  AcademicRecord,
  AcademicRecordRepository,
  AcademicRecordStatus,
  GradeEntry,
  PromotionDecision,
  RecordAmendment,
} from "@knowget/assessment-evaluation";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface AcademicRecordRow {
  id: string;
  tenantId: string;
  organizationId: string;
  studentId: string;
  academicYear: string;
  term: string;
  gradeEntries: unknown;
  gpa: number | null;
  totalCredits: number;
  promotionDecision: string;
  status: string;
  version: number;
  amendments: unknown;
  publishedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AcademicRecordRow): AcademicRecord {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    studentId: row.studentId as Uuid,
    academicYear: row.academicYear,
    term: row.term,
    gradeEntries: (row.gradeEntries as GradeEntry[]) ?? [],
    gpa: row.gpa,
    totalCredits: row.totalCredits,
    promotionDecision: row.promotionDecision as PromotionDecision,
    status: row.status as AcademicRecordStatus,
    version: row.version,
    amendments: (row.amendments as RecordAmendment[]) ?? [],
    publishedAt: row.publishedAt,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(record: AcademicRecord) {
  return {
    tenantId: record.tenantId,
    organizationId: record.organizationId,
    studentId: record.studentId,
    academicYear: record.academicYear,
    term: record.term,
    gradeEntries: JSON.parse(JSON.stringify(record.gradeEntries)),
    gpa: record.gpa,
    totalCredits: record.totalCredits,
    promotionDecision: record.promotionDecision,
    status: record.status,
    version: record.version,
    amendments: JSON.parse(JSON.stringify(record.amendments)),
    publishedAt: record.publishedAt,
  };
}

/** Prisma-backed {@link AcademicRecordRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaAcademicRecordRepository implements AcademicRecordRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<AcademicRecord | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.academicRecord.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByStudentYearTerm(
    tenantId: TenantId,
    studentId: Uuid,
    academicYear: string,
    term: string,
  ): Promise<AcademicRecord | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.academicRecord.findFirst({
        where: { studentId, academicYear, term, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<AcademicRecord[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.academicRecord.findMany({ where: { studentId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AcademicRecord[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.academicRecord.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<AcademicRecord[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.academicRecord.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(record: AcademicRecord): Promise<void> {
    return withTenant(this.db, record.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(record);
      await tx.academicRecord.upsert({
        where: { id: record.id },
        create: { id: record.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.academicRecord.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
