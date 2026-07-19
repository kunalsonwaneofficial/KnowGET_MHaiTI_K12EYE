import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { ApplicationDocument, DocumentStatus } from "./application-document";
import {
  DocumentNotFoundError,
  EmptyDocumentTypeError,
  InvalidApplicantTransitionError,
} from "./errors";

/**
 * The application lifecycle: a `draft` is `submitted`, moves through `under_review`
 * (optionally via a scheduled interview), and reaches a terminal `approved`,
 * `rejected` or `withdrawn`.
 */
export type ApplicantStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "interview_scheduled"
  | "approved"
  | "rejected"
  | "withdrawn";

/** A scheduled admission interview and its recorded outcome. */
export interface ApplicationInterview {
  readonly scheduledOn: string;
  readonly mode: string | null;
  readonly outcome: string | null;
}

/** The recorded admission decision on an application. */
export interface AdmissionDecision {
  readonly outcome: "approved" | "rejected";
  readonly decidedOn: string;
  readonly decidedById: Uuid | null;
  readonly note: string | null;
}

/**
 * A formal application by a prospective learner. Identity is a {@link Person}
 * (`personId`); the applicant carries the application lifecycle, the document
 * checklist, an optional interview and the admission decision. Optionally converted
 * from a {@link Prospect} (`prospectId`).
 */
export interface Applicant {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly personId: Uuid;
  readonly prospectId: Uuid | null;
  readonly programId: Uuid | null;
  readonly status: ApplicantStatus;
  readonly documents: readonly ApplicationDocument[];
  readonly interview: ApplicationInterview | null;
  readonly decision: AdmissionDecision | null;
  readonly submittedOn: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface StartApplicationParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly personId: Uuid;
  readonly prospectId?: Uuid | null;
  readonly programId?: Uuid | null;
  readonly requiredDocuments?: readonly string[];
}

const dedupeDocuments = (types: readonly string[]): ApplicationDocument[] => {
  const seen = new Set<string>();
  const documents: ApplicationDocument[] = [];
  for (const raw of types) {
    const type = raw.trim();
    if (type.length === 0) {
      throw new EmptyDocumentTypeError();
    }
    if (!seen.has(type)) {
      seen.add(type);
      documents.push({ type, status: "required" });
    }
  }
  return documents;
};

/** Start a new application in `draft`, seeding the document checklist. */
export function startApplication(params: StartApplicationParams): Applicant {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    personId: params.personId,
    prospectId: params.prospectId ?? null,
    programId: params.programId ?? null,
    status: "draft",
    documents: dedupeDocuments(params.requiredDocuments ?? []),
    interview: null,
    decision: null,
    submittedOn: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (applicant: Applicant, patch: Partial<Applicant>): Applicant => ({
  ...applicant,
  ...patch,
  updatedAt: nowIso(),
});

const requireStatus = (
  applicant: Applicant,
  allowed: readonly ApplicantStatus[],
  to: string,
): void => {
  if (!allowed.includes(applicant.status)) {
    throw new InvalidApplicantTransitionError(applicant.status, to);
  }
};

/** Add a required document to the checklist (while the application is open). */
export function addRequiredDocument(applicant: Applicant, type: string): Applicant {
  const trimmed = type.trim();
  if (trimmed.length === 0) {
    throw new EmptyDocumentTypeError();
  }
  requireStatus(
    applicant,
    ["draft", "submitted", "under_review", "interview_scheduled"],
    "add_document",
  );
  if (applicant.documents.some((d) => d.type === trimmed)) {
    return applicant;
  }
  return touch(applicant, {
    documents: [...applicant.documents, { type: trimmed, status: "required" }],
  });
}

/** Update the status of a document already on the checklist. */
export function setDocumentStatus(
  applicant: Applicant,
  type: string,
  status: DocumentStatus,
): Applicant {
  if (!applicant.documents.some((d) => d.type === type)) {
    throw new DocumentNotFoundError(type);
  }
  return touch(applicant, {
    documents: applicant.documents.map((d) => (d.type === type ? { ...d, status } : d)),
  });
}

/** Submit a drafted application for consideration. */
export function submitApplication(applicant: Applicant): Applicant {
  requireStatus(applicant, ["draft"], "submitted");
  return touch(applicant, { status: "submitted", submittedOn: nowIso().slice(0, 10) });
}

/** Begin reviewing a submitted application. */
export function beginReview(applicant: Applicant): Applicant {
  requireStatus(applicant, ["submitted", "interview_scheduled"], "under_review");
  return touch(applicant, { status: "under_review" });
}

export interface ScheduleInterviewParams {
  readonly scheduledOn: string;
  readonly mode?: string | null;
}

/** Schedule an admission interview for an application under review. */
export function scheduleInterview(
  applicant: Applicant,
  params: ScheduleInterviewParams,
): Applicant {
  requireStatus(applicant, ["submitted", "under_review"], "interview_scheduled");
  return touch(applicant, {
    status: "interview_scheduled",
    interview: {
      scheduledOn: params.scheduledOn,
      mode: params.mode?.trim() || null,
      outcome: null,
    },
  });
}

/** Record the outcome of a scheduled interview, returning the application to review. */
export function recordInterviewOutcome(applicant: Applicant, outcome: string): Applicant {
  requireStatus(applicant, ["interview_scheduled"], "interview_outcome");
  const interview = applicant.interview
    ? { ...applicant.interview, outcome: outcome.trim() || null }
    : null;
  return touch(applicant, { status: "under_review", interview });
}

export interface DecideApplicationParams {
  readonly decidedById?: Uuid | null;
  readonly decidedOn?: string | null;
  readonly note?: string | null;
}

const decide = (
  applicant: Applicant,
  outcome: "approved" | "rejected",
  params: DecideApplicationParams,
): Applicant => {
  requireStatus(applicant, ["submitted", "under_review", "interview_scheduled"], outcome);
  const decision: AdmissionDecision = {
    outcome,
    decidedOn: params.decidedOn ?? nowIso().slice(0, 10),
    decidedById: params.decidedById ?? null,
    note: params.note?.trim() || null,
  };
  return touch(applicant, { status: outcome, decision });
};

/** Approve an application (admission granted). */
export const approveApplication = (
  applicant: Applicant,
  params: DecideApplicationParams = {},
): Applicant => decide(applicant, "approved", params);

/** Reject an application. */
export const rejectApplication = (
  applicant: Applicant,
  params: DecideApplicationParams = {},
): Applicant => decide(applicant, "rejected", params);

/** Withdraw an application still in progress. */
export function withdrawApplication(applicant: Applicant): Applicant {
  requireStatus(
    applicant,
    ["draft", "submitted", "under_review", "interview_scheduled"],
    "withdrawn",
  );
  return touch(applicant, { status: "withdrawn" });
}

/** Whether the application ended in an admission offer. */
export const isApproved = (applicant: Applicant): boolean => applicant.status === "approved";
