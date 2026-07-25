import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type {
  AcademicRecordStatus,
  GradeEntry,
  PromotionDecision,
  RecordAmendment,
} from "./academic-record-value";
import {
  AcademicRecordStateError,
  EmptyAcademicRecordFieldError,
  InvalidRecordAmendmentError,
} from "./errors";
import { computeGpa } from "./grading";

/**
 * A learner's academic record for an academic year and term — grade entries (marks, percentage,
 * grade, GPA and credits per subject), the overall GPA, credits, the promotion decision and the
 * transcript. **Immutable after publication**: a published record changes only through the
 * controlled, append-only amendment workflow (every change a reasoned, attributed
 * {@link RecordAmendment} with a version bump), satisfying the P2-D10 definition of done.
 */
export interface AcademicRecord {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly academicYear: string;
  readonly term: string;
  readonly gradeEntries: readonly GradeEntry[];
  readonly gpa: number | null;
  readonly totalCredits: number;
  readonly promotionDecision: PromotionDecision;
  readonly status: AcademicRecordStatus;
  readonly version: number;
  readonly amendments: readonly RecordAmendment[];
  readonly publishedAt: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateAcademicRecordParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly academicYear: string;
  readonly term: string;
  readonly gradeEntries?: readonly GradeEntry[];
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyAcademicRecordFieldError(field);
  }
  return trimmed;
};

const touch = (record: AcademicRecord, patch: Partial<AcademicRecord>): AcademicRecord => ({
  ...record,
  ...patch,
  updatedAt: nowIso(),
});

const gpaOf = (entries: readonly GradeEntry[]): number =>
  computeGpa(entries.map((e) => ({ gpa: e.gpa, credits: e.credits })));

const creditsOf = (entries: readonly GradeEntry[]): number =>
  entries.reduce((sum, e) => sum + Math.max(0, e.credits), 0);

const assertDraft = (record: AcademicRecord): void => {
  if (record.status !== "draft") {
    throw new AcademicRecordStateError(record.id, "draft", record.status);
  }
};

const assertPublished = (record: AcademicRecord): void => {
  if (record.status !== "published") {
    throw new AcademicRecordStateError(record.id, "published", record.status);
  }
};

const amendment = (field: string, reason: string, amendedBy: Uuid | null): RecordAmendment => {
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    throw new InvalidRecordAmendmentError("a reason is required");
  }
  return { field, reason: trimmed, amendedBy, amendedAt: nowIso() };
};

/** Create a new draft academic record, computing GPA and credits from any initial entries. */
export function createAcademicRecord(params: CreateAcademicRecordParams): AcademicRecord {
  const now = nowIso();
  const gradeEntries = params.gradeEntries ? [...params.gradeEntries] : [];
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    studentId: params.studentId,
    academicYear: requireText(params.academicYear, "academic year"),
    term: requireText(params.term, "term"),
    gradeEntries,
    gpa: gradeEntries.length > 0 ? gpaOf(gradeEntries) : null,
    totalCredits: creditsOf(gradeEntries),
    promotionDecision: "pending",
    status: "draft",
    version: 1,
    amendments: [],
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Replace the grade entries (recomputing GPA and credits). Only while a draft. */
export function setGradeEntries(
  record: AcademicRecord,
  gradeEntries: readonly GradeEntry[],
): AcademicRecord {
  assertDraft(record);
  const entries = [...gradeEntries];
  return touch(record, {
    gradeEntries: entries,
    gpa: entries.length > 0 ? gpaOf(entries) : null,
    totalCredits: creditsOf(entries),
  });
}

/** Set the promotion decision. Only while a draft. */
export function setPromotionDecision(
  record: AcademicRecord,
  promotionDecision: PromotionDecision,
): AcademicRecord {
  assertDraft(record);
  return touch(record, { promotionDecision });
}

/** Publish the record, making it immutable except through amendments (draft → published). */
export function publishAcademicRecord(record: AcademicRecord): AcademicRecord {
  assertDraft(record);
  return touch(record, { status: "published", publishedAt: nowIso() });
}

/**
 * Amend a published record's grade entries through the controlled workflow — recompute GPA and
 * credits, append a reasoned amendment, and bump the version. Only while published.
 */
export function amendGradeEntries(
  record: AcademicRecord,
  gradeEntries: readonly GradeEntry[],
  reason: string,
  amendedBy: Uuid | null = null,
): AcademicRecord {
  assertPublished(record);
  const entries = [...gradeEntries];
  return touch(record, {
    gradeEntries: entries,
    gpa: entries.length > 0 ? gpaOf(entries) : null,
    totalCredits: creditsOf(entries),
    version: record.version + 1,
    amendments: [...record.amendments, amendment("gradeEntries", reason, amendedBy)],
  });
}

/** Amend a published record's promotion decision through the controlled workflow. */
export function amendPromotionDecision(
  record: AcademicRecord,
  promotionDecision: PromotionDecision,
  reason: string,
  amendedBy: Uuid | null = null,
): AcademicRecord {
  assertPublished(record);
  return touch(record, {
    promotionDecision,
    version: record.version + 1,
    amendments: [...record.amendments, amendment("promotionDecision", reason, amendedBy)],
  });
}
