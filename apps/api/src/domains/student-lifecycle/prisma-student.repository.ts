import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type {
  AcademicStatus,
  AdministrativeStatus,
  EnrollmentStatus,
  Student,
  StudentRepository,
} from "@knowget/student-lifecycle";
import type { TenantId, Uuid } from "@knowget/types";

interface StudentRow {
  id: string;
  tenantId: string;
  organizationId: string;
  personId: string;
  membershipId: string | null;
  applicantId: string | null;
  studentNumber: string;
  programId: string | null;
  sectionId: string | null;
  academicYear: string | null;
  rollNumber: string | null;
  enrollmentStatus: string;
  academicStatus: string;
  administrativeStatus: string;
  enrolledOn: Date | null;
  exitedOn: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const toDate = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

const fromDate = (value: string | null): Date | null => (value ? new Date(value) : null);

function toDomain(row: StudentRow): Student {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    personId: row.personId as Uuid,
    membershipId: row.membershipId as Uuid | null,
    applicantId: row.applicantId as Uuid | null,
    studentNumber: row.studentNumber,
    programId: row.programId as Uuid | null,
    sectionId: row.sectionId as Uuid | null,
    academicYear: row.academicYear,
    rollNumber: row.rollNumber,
    enrollmentStatus: row.enrollmentStatus as EnrollmentStatus,
    academicStatus: row.academicStatus as AcademicStatus,
    administrativeStatus: row.administrativeStatus as AdministrativeStatus,
    enrolledOn: toDate(row.enrolledOn),
    exitedOn: toDate(row.exitedOn),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(student: Student) {
  return {
    tenantId: student.tenantId,
    organizationId: student.organizationId,
    personId: student.personId,
    membershipId: student.membershipId,
    applicantId: student.applicantId,
    studentNumber: student.studentNumber,
    programId: student.programId,
    sectionId: student.sectionId,
    academicYear: student.academicYear,
    rollNumber: student.rollNumber,
    enrollmentStatus: student.enrollmentStatus,
    academicStatus: student.academicStatus,
    administrativeStatus: student.administrativeStatus,
    enrolledOn: fromDate(student.enrolledOn),
    exitedOn: fromDate(student.exitedOn),
  };
}

/** Prisma-backed {@link StudentRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaStudentRepository implements StudentRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Student | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.student.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByStudentNumber(tenantId: TenantId, studentNumber: string): Promise<Student | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.student.findFirst({ where: { studentNumber, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Student[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.student.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByPerson(tenantId: TenantId, personId: Uuid): Promise<Student[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.student.findMany({ where: { personId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Student[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.student.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(student: Student): Promise<void> {
    return withTenant(this.db, student.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(student);
      await tx.student.upsert({
        where: { id: student.id },
        create: { id: student.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.student.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
