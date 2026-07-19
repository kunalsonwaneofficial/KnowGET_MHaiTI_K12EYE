import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { Applicant } from "./applicant";
import type { LeadSource } from "./lead-source";
import type { Prospect } from "./prospect";
import type { EnrollmentStatus, Student } from "./student";

// --- Prospect --------------------------------------------------------------------
export const PROSPECT_CREATED = "student.prospect.created";

export interface ProspectCreatedPayload {
  readonly prospectId: Uuid;
  readonly organizationId: Uuid;
  readonly personId: Uuid;
  readonly leadSource: LeadSource;
}

export type ProspectCreatedEvent = DomainEvent<typeof PROSPECT_CREATED, ProspectCreatedPayload>;

export const prospectCreated = (prospect: Prospect): ProspectCreatedEvent =>
  createEvent(
    PROSPECT_CREATED,
    {
      prospectId: prospect.id,
      organizationId: prospect.organizationId,
      personId: prospect.personId,
      leadSource: prospect.leadSource,
    },
    { tenantId: prospect.tenantId },
  );

// --- Applicant -------------------------------------------------------------------
export const APPLICATION_SUBMITTED = "student.application.submitted";
export const APPLICANT_APPROVED = "student.applicant.approved";

export interface ApplicationEventPayload {
  readonly applicantId: Uuid;
  readonly organizationId: Uuid;
  readonly personId: Uuid;
  readonly programId: Uuid | null;
}

export type ApplicationSubmittedEvent = DomainEvent<
  typeof APPLICATION_SUBMITTED,
  ApplicationEventPayload
>;
export type ApplicantApprovedEvent = DomainEvent<
  typeof APPLICANT_APPROVED,
  ApplicationEventPayload
>;

const applicationPayload = (applicant: Applicant): ApplicationEventPayload => ({
  applicantId: applicant.id,
  organizationId: applicant.organizationId,
  personId: applicant.personId,
  programId: applicant.programId,
});

export const applicationSubmitted = (applicant: Applicant): ApplicationSubmittedEvent =>
  createEvent(APPLICATION_SUBMITTED, applicationPayload(applicant), {
    tenantId: applicant.tenantId,
  });

export const applicantApproved = (applicant: Applicant): ApplicantApprovedEvent =>
  createEvent(APPLICANT_APPROVED, applicationPayload(applicant), { tenantId: applicant.tenantId });

// --- Student ---------------------------------------------------------------------
export const STUDENT_ENROLLED = "student.enrolled";
export const STUDENT_PROMOTED = "student.promoted";
export const STUDENT_TRANSFERRED = "student.transferred";
export const STUDENT_WITHDRAWN = "student.withdrawn";
export const STUDENT_GRADUATED = "student.graduated";
export const STUDENT_BECAME_ALUMNI = "student.became_alumni";

export interface StudentEventPayload {
  readonly studentId: Uuid;
  readonly organizationId: Uuid;
  readonly personId: Uuid;
  readonly studentNumber: string;
  readonly enrollmentStatus: EnrollmentStatus;
}

export type StudentEnrolledEvent = DomainEvent<typeof STUDENT_ENROLLED, StudentEventPayload>;
export type StudentPromotedEvent = DomainEvent<typeof STUDENT_PROMOTED, StudentEventPayload>;
export type StudentTransferredEvent = DomainEvent<typeof STUDENT_TRANSFERRED, StudentEventPayload>;
export type StudentWithdrawnEvent = DomainEvent<typeof STUDENT_WITHDRAWN, StudentEventPayload>;
export type StudentGraduatedEvent = DomainEvent<typeof STUDENT_GRADUATED, StudentEventPayload>;
export type StudentBecameAlumniEvent = DomainEvent<
  typeof STUDENT_BECAME_ALUMNI,
  StudentEventPayload
>;

const studentPayload = (student: Student): StudentEventPayload => ({
  studentId: student.id,
  organizationId: student.organizationId,
  personId: student.personId,
  studentNumber: student.studentNumber,
  enrollmentStatus: student.enrollmentStatus,
});

export const studentEnrolled = (student: Student): StudentEnrolledEvent =>
  createEvent(STUDENT_ENROLLED, studentPayload(student), { tenantId: student.tenantId });

export const studentPromoted = (student: Student): StudentPromotedEvent =>
  createEvent(STUDENT_PROMOTED, studentPayload(student), { tenantId: student.tenantId });

export const studentTransferred = (student: Student): StudentTransferredEvent =>
  createEvent(STUDENT_TRANSFERRED, studentPayload(student), { tenantId: student.tenantId });

export const studentWithdrawn = (student: Student): StudentWithdrawnEvent =>
  createEvent(STUDENT_WITHDRAWN, studentPayload(student), { tenantId: student.tenantId });

export const studentGraduated = (student: Student): StudentGraduatedEvent =>
  createEvent(STUDENT_GRADUATED, studentPayload(student), { tenantId: student.tenantId });

export const studentBecameAlumni = (student: Student): StudentBecameAlumniEvent =>
  createEvent(STUDENT_BECAME_ALUMNI, studentPayload(student), { tenantId: student.tenantId });
