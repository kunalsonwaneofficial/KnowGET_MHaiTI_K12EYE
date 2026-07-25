import type { ISODateString, Uuid } from "@knowget/types";

/**
 * Lifecycle of an academic record. A `draft` is being assembled; **publishing makes it
 * immutable** — thereafter it changes only through a controlled, append-only amendment
 * workflow (the P2-D10 definition of done).
 */
export const ACADEMIC_RECORD_STATUSES = ["draft", "published"] as const;

export type AcademicRecordStatus = (typeof ACADEMIC_RECORD_STATUSES)[number];

/** The promotion decision recorded on an academic record. */
export const PROMOTION_DECISIONS = [
  "pending",
  "promoted",
  "promoted_with_support",
  "retained",
] as const;

export type PromotionDecision = (typeof PROMOTION_DECISIONS)[number];

/**
 * One subject's result on an academic record — marks over a maximum, the computed percentage,
 * the awarded grade label, GPA points and credits. Grades and GPA are produced by the pure
 * grading engine from the governing framework's grade bands.
 */
export interface GradeEntry {
  readonly subjectId: Uuid;
  readonly marks: number;
  readonly maxMarks: number;
  readonly percentage: number;
  readonly grade: string | null;
  readonly gpa: number | null;
  readonly credits: number;
}

/**
 * One entry in a published record's append-only amendment log — which field changed, the reason,
 * who authorised it and when. A published record is never mutated in place; every correction is
 * a reasoned, attributed amendment.
 */
export interface RecordAmendment {
  readonly field: string;
  readonly reason: string;
  readonly amendedBy: Uuid | null;
  readonly amendedAt: ISODateString;
}

/** Narrow an arbitrary string to a {@link PromotionDecision}. */
export const isPromotionDecision = (value: string): value is PromotionDecision =>
  (PROMOTION_DECISIONS as readonly string[]).includes(value);
