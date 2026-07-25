/**
 * The methodology an assessment applies. The platform supports every K–12 assessment type
 * simultaneously — formative and summative, diagnostic, CCE and CBE, project / practical / oral
 * / portfolio / observation, and board / institution-designed examinations.
 */
export const ASSESSMENT_TYPES = [
  "formative",
  "summative",
  "diagnostic",
  "cce",
  "cbe",
  "project",
  "practical",
  "oral",
  "portfolio",
  "observation",
  "board",
  "institution",
] as const;

export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

/**
 * Lifecycle of an assessment: authored as a draft, published, started (in progress), then
 * completed — or cancelled. Terminal states are completed and cancelled.
 */
export const ASSESSMENT_STATUSES = [
  "draft",
  "published",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

/** How the assessment is delivered. Future AI-assisted proctoring is a later-phase concern. */
export const DELIVERY_MODES = ["offline", "online", "hybrid", "practical"] as const;

export type DeliveryMode = (typeof DELIVERY_MODES)[number];

/** How responses are evaluated — free-form manual marking or a structured rubric. */
export const EVALUATION_STRATEGIES = ["manual", "rubric_based"] as const;

export type EvaluationStrategy = (typeof EVALUATION_STRATEGIES)[number];

/** One criterion in an assessment's rubric — a name, its maximum score, and an optional descriptor. */
export interface RubricCriterion {
  readonly name: string;
  readonly maxScore: number;
  readonly descriptor: string | null;
}

/** Narrow an arbitrary string to an {@link AssessmentType}. */
export const isAssessmentType = (value: string): value is AssessmentType =>
  (ASSESSMENT_TYPES as readonly string[]).includes(value);
