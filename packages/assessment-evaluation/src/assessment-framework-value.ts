import type { ISODateString } from "@knowget/types";

/**
 * The institutional assessment philosophy a framework expresses. `cce` is Continuous and
 * Comprehensive Evaluation; `cbe` / `competency_based` are competency-based education; `hybrid`
 * blends models. The platform supports multiple frameworks per institution simultaneously.
 */
export const ASSESSMENT_MODELS = [
  "traditional",
  "cce",
  "cbe",
  "competency_based",
  "hybrid",
] as const;

export type AssessmentModel = (typeof ASSESSMENT_MODELS)[number];

/** Lifecycle of an assessment framework. Only an `active` framework governs assessment. */
export const ASSESSMENT_FRAMEWORK_STATUSES = ["draft", "active", "archived"] as const;

export type AssessmentFrameworkStatus = (typeof ASSESSMENT_FRAMEWORK_STATUSES)[number];

/**
 * One band in a grading model — a label (e.g. `A+`), the inclusive minimum percentage that
 * earns it, and optional GPA points. The grading engine picks the highest-minimum band a
 * percentage satisfies. Plain value object shared with the pure grading engine.
 */
export interface GradeBand {
  readonly label: string;
  readonly minPercentage: number;
  readonly gpa: number | null;
}

/** One entry in a framework's append-only revision log. */
export interface AssessmentFrameworkRevision {
  readonly version: number;
  readonly note: string;
  readonly revisedAt: ISODateString;
}

/** Narrow an arbitrary string to an {@link AssessmentModel}. */
export const isAssessmentModel = (value: string): value is AssessmentModel =>
  (ASSESSMENT_MODELS as readonly string[]).includes(value);
