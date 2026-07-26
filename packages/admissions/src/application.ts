import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyApplicationCodeError,
  EmptyApplicationGradeError,
  InvalidApplicationTransitionError,
} from "./errors";
import { type ApplicationStatus, OPEN_APPLICATION_STATUSES } from "./admissions-value";

const OPEN_APPLICATION = new Set<string>(OPEN_APPLICATION_STATUSES);

/**
 * An application — the admissions process record for one applicant in one cycle, for a grade. It references
 * the applicant as a Person (P2-D01-M02; the prospect/applicant lifecycle record is Student Lifecycle's,
 * P2-D03) and, optionally, the originating lead. It runs `submitted → under_review → interview → offered`,
 * with `waitlisted`, `rejected` and `withdrawn` as terminal branches; only an open application is worked, and
 * an offer (a separate aggregate) is extended once it reaches `offered`.
 */
export interface Application {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly cycleId: Uuid;
  readonly applicantPersonId: Uuid;
  readonly leadId: Uuid | null;
  readonly code: string;
  readonly gradeApplyingFor: string;
  readonly status: ApplicationStatus;
  readonly submittedOn: string;
  readonly decidedOn: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateApplicationParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly cycleId: Uuid;
  readonly applicantPersonId: Uuid;
  readonly code: string;
  readonly gradeApplyingFor: string;
  readonly submittedOn: string;
  readonly leadId?: Uuid | null;
}

/** Submit an application (status `submitted`). Code and grade required. */
export function createApplication(params: CreateApplicationParams): Application {
  const code = params.code.trim();
  if (code.length === 0) {
    throw new EmptyApplicationCodeError();
  }
  const gradeApplyingFor = params.gradeApplyingFor.trim();
  if (gradeApplyingFor.length === 0) {
    throw new EmptyApplicationGradeError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    cycleId: params.cycleId,
    applicantPersonId: params.applicantPersonId,
    leadId: params.leadId ?? null,
    code,
    gradeApplyingFor,
    status: "submitted",
    submittedOn: params.submittedOn,
    decidedOn: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (application: Application, patch: Partial<Application>): Application => ({
  ...application,
  ...patch,
  updatedAt: nowIso(),
});

const requireOpen = (application: Application, to: string): void => {
  if (!OPEN_APPLICATION.has(application.status)) {
    throw new InvalidApplicationTransitionError(application.status, to);
  }
};

/** Start reviewing a submitted application (`submitted → under_review`). */
export function startApplicationReview(application: Application): Application {
  if (application.status !== "submitted") {
    throw new InvalidApplicationTransitionError(application.status, "under_review");
  }
  return touch(application, { status: "under_review" });
}

/** Move an application to interview (`under_review → interview`). */
export function scheduleApplicationInterview(application: Application): Application {
  if (application.status !== "under_review") {
    throw new InvalidApplicationTransitionError(application.status, "interview");
  }
  return touch(application, { status: "interview" });
}

/** Decide to offer (`under_review`/`interview → offered`), stamping the decision date. */
export function offerApplication(application: Application, decidedOn: string): Application {
  if (application.status !== "under_review" && application.status !== "interview") {
    throw new InvalidApplicationTransitionError(application.status, "offered");
  }
  return touch(application, { status: "offered", decidedOn });
}

/** Waitlist an open application (→ `waitlisted`, terminal), stamping the decision date. */
export function waitlistApplication(application: Application, decidedOn: string): Application {
  requireOpen(application, "waitlisted");
  return touch(application, { status: "waitlisted", decidedOn });
}

/** Reject an open application (→ `rejected`, terminal), stamping the decision date. */
export function rejectApplication(application: Application, decidedOn: string): Application {
  requireOpen(application, "rejected");
  return touch(application, { status: "rejected", decidedOn });
}

/** Withdraw an open application (→ `withdrawn`, terminal), stamping the decision date. */
export function withdrawApplication(application: Application, decidedOn: string): Application {
  requireOpen(application, "withdrawn");
  return touch(application, { status: "withdrawn", decidedOn });
}

/** Whether the application is still open (under consideration). */
export const isApplicationOpen = (application: Application): boolean =>
  OPEN_APPLICATION.has(application.status);

/** Whether the application has reached the offered state (an offer may be extended). */
export const isApplicationOffered = (application: Application): boolean =>
  application.status === "offered";
