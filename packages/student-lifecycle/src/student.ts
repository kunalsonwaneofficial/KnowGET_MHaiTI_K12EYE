import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyStudentNumberError, InvalidStudentTransitionError } from "./errors";

/**
 * The enrolled-learner lifecycle: `enrolled` becomes `active`, may go `on_leave`
 * and back, and reaches a terminal `transferred`, `withdrawn` or `graduated` —
 * after which a graduate becomes an `alumni`.
 */
export type EnrollmentStatus =
  "enrolled" | "active" | "on_leave" | "transferred" | "withdrawn" | "graduated" | "alumni";

/** Academic standing, independent of enrollment status. */
export type AcademicStatus = "good_standing" | "probation" | "suspended";

/** Administrative standing (e.g. a hold blocking services), independent of the rest. */
export type AdministrativeStatus = "clear" | "hold";

/**
 * An enrolled learner. Identity is a {@link Person} (`personId`) and the
 * institutional affiliation a {@link Membership} (`membershipId`) — the student
 * record never duplicates either. It carries the enrollment/academic/administrative
 * status, the program / campus (organization) / section / academic-year assignment,
 * the student and roll numbers, and the enrolment and exit dates.
 */
export interface Student {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly personId: Uuid;
  readonly membershipId: Uuid | null;
  readonly applicantId: Uuid | null;
  readonly studentNumber: string;
  readonly programId: Uuid | null;
  readonly sectionId: Uuid | null;
  readonly academicYear: string | null;
  readonly rollNumber: string | null;
  readonly enrollmentStatus: EnrollmentStatus;
  readonly academicStatus: AcademicStatus;
  readonly administrativeStatus: AdministrativeStatus;
  readonly enrolledOn: string | null;
  readonly exitedOn: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface EnrollStudentParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly personId: Uuid;
  readonly studentNumber: string;
  readonly membershipId?: Uuid | null;
  readonly applicantId?: Uuid | null;
  readonly programId?: Uuid | null;
  readonly sectionId?: Uuid | null;
  readonly academicYear?: string | null;
  readonly rollNumber?: string | null;
  readonly enrolledOn?: string | null;
}

/** Enroll a learner as a student (status `enrolled`, good standing, clear). */
export function enrollStudent(params: EnrollStudentParams): Student {
  const studentNumber = params.studentNumber.trim();
  if (studentNumber.length === 0) {
    throw new EmptyStudentNumberError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    personId: params.personId,
    membershipId: params.membershipId ?? null,
    applicantId: params.applicantId ?? null,
    studentNumber,
    programId: params.programId ?? null,
    sectionId: params.sectionId ?? null,
    academicYear: params.academicYear?.trim() || null,
    rollNumber: params.rollNumber?.trim() || null,
    enrollmentStatus: "enrolled",
    academicStatus: "good_standing",
    administrativeStatus: "clear",
    enrolledOn: params.enrolledOn ?? now.slice(0, 10),
    exitedOn: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (student: Student, patch: Partial<Student>): Student => ({
  ...student,
  ...patch,
  updatedAt: nowIso(),
});

const requireStatus = (
  student: Student,
  allowed: readonly EnrollmentStatus[],
  to: string,
): void => {
  if (!allowed.includes(student.enrollmentStatus)) {
    throw new InvalidStudentTransitionError(student.enrollmentStatus, to);
  }
};

/** Statuses in which a student is currently on the institution's active roll. */
const ON_ROLL: readonly EnrollmentStatus[] = ["enrolled", "active", "on_leave"];

/** Begin active attendance for a newly-enrolled student. */
export function activateStudent(student: Student): Student {
  requireStatus(student, ["enrolled"], "active");
  return touch(student, { enrollmentStatus: "active" });
}

/** Place an active student on leave. */
export function placeOnLeave(student: Student): Student {
  requireStatus(student, ["active"], "on_leave");
  return touch(student, { enrollmentStatus: "on_leave" });
}

/** Return a student from leave to active attendance. */
export function returnFromLeave(student: Student): Student {
  requireStatus(student, ["on_leave"], "active");
  return touch(student, { enrollmentStatus: "active" });
}

export interface PromoteStudentParams {
  readonly academicYear?: string | null;
  readonly sectionId?: Uuid | null;
}

/** Promote a student to the next academic year (optionally a new section). */
export function promoteStudent(student: Student, params: PromoteStudentParams = {}): Student {
  requireStatus(student, ["active"], "promoted");
  return touch(student, {
    ...(params.academicYear !== undefined
      ? { academicYear: params.academicYear?.trim() || null }
      : {}),
    ...(params.sectionId !== undefined ? { sectionId: params.sectionId } : {}),
  });
}

const exit = (
  student: Student,
  to: Extract<EnrollmentStatus, "transferred" | "withdrawn" | "graduated">,
  allowed: readonly EnrollmentStatus[],
  exitedOn?: string | null,
): Student => {
  requireStatus(student, allowed, to);
  return touch(student, { enrollmentStatus: to, exitedOn: exitedOn ?? nowIso().slice(0, 10) });
};

/** Transfer a student out to another institution. */
export const transferStudent = (student: Student, exitedOn?: string | null): Student =>
  exit(student, "transferred", ON_ROLL, exitedOn);

/** Withdraw a student from the institution. */
export const withdrawStudent = (student: Student, exitedOn?: string | null): Student =>
  exit(student, "withdrawn", ON_ROLL, exitedOn);

/** Graduate an active student. */
export const graduateStudent = (student: Student, exitedOn?: string | null): Student =>
  exit(student, "graduated", ["active"], exitedOn);

/** Move a graduate into the alumni community. */
export function makeAlumni(student: Student): Student {
  requireStatus(student, ["graduated"], "alumni");
  return touch(student, { enrollmentStatus: "alumni" });
}

/** Assign or change the student's section (while on roll). */
export function assignSection(student: Student, sectionId: Uuid | null): Student {
  requireStatus(student, ON_ROLL, "assign_section");
  return touch(student, { sectionId });
}

/** Assign or change the student's roll number (while on roll). */
export function assignRollNumber(student: Student, rollNumber: string | null): Student {
  requireStatus(student, ON_ROLL, "assign_roll_number");
  return touch(student, { rollNumber: rollNumber?.trim() || null });
}

/** Set the student's academic standing. */
export const setAcademicStatus = (student: Student, academicStatus: AcademicStatus): Student =>
  touch(student, { academicStatus });

/** Set the student's administrative standing (e.g. place or clear a hold). */
export const setAdministrativeStatus = (
  student: Student,
  administrativeStatus: AdministrativeStatus,
): Student => touch(student, { administrativeStatus });

/** Whether the student currently occupies a seat on the institution's roll. */
export const isOnRoll = (student: Student): boolean => ON_ROLL.includes(student.enrollmentStatus);
