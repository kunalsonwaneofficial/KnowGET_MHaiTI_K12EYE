import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

/**
 * An enrollment confirmation — the immutable, terminal fact that an accepted offer has been turned into a
 * confirmed seat for a grade in a cycle. It closes the admissions funnel and is the hand-off point to Student
 * Lifecycle (P2-D03): the `admissions.enrollment.confirmed` event carries the applicant person and grade so
 * that domain can enrol the student, and `studentId` records the resulting student reference once known. It
 * has no lifecycle and no edit or delete path — a confirmation is a fact; a reversal is a separate withdrawal
 * concern, not an edit here. One confirmation per offer.
 */
export interface EnrollmentConfirmation {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly offerId: Uuid;
  readonly applicationId: Uuid;
  readonly cycleId: Uuid;
  readonly applicantPersonId: Uuid;
  readonly gradeConfirmed: string;
  /** The Student Lifecycle (P2-D03) student reference, when the enrolled student record is already known. */
  readonly studentId: Uuid | null;
  readonly confirmedOn: string;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface ConfirmEnrollmentParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly offerId: Uuid;
  readonly applicationId: Uuid;
  readonly cycleId: Uuid;
  readonly applicantPersonId: Uuid;
  readonly gradeConfirmed: string;
  readonly studentId?: Uuid | null;
  readonly confirmedOn: string;
}

/** Confirm an enrollment from an accepted offer. Immutable: factory only, no update or delete path. */
export function confirmEnrollment(params: ConfirmEnrollmentParams): EnrollmentConfirmation {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    offerId: params.offerId,
    applicationId: params.applicationId,
    cycleId: params.cycleId,
    applicantPersonId: params.applicantPersonId,
    gradeConfirmed: params.gradeConfirmed,
    studentId: params.studentId ?? null,
    confirmedOn: params.confirmedOn,
    createdAt: now,
    updatedAt: now,
  };
}
