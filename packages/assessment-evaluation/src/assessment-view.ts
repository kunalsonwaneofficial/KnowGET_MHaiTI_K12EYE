import type { Uuid } from "@knowget/types";
import type { AssessmentStatus } from "./assessment-value";
import type { MasteryLevel } from "./competency-value";
import type { EvaluationStatus } from "./evaluation-value";

/**
 * The narrow views the assessment-intelligence engine consumes. Each aggregate structurally
 * satisfies its view, so the engine depends on no aggregate — the same pure-engine-over-views
 * pattern used across P2-D07…D09.
 */

/** The minimal view of an evaluation the engine needs (workflow state + computed percentage). */
export interface EvaluationView {
  readonly status: EvaluationStatus;
  readonly percentage: number | null;
}

/** The minimal view of an assessment the engine needs (state + the outcomes it assesses). */
export interface AssessmentView {
  readonly status: AssessmentStatus;
  readonly learningOutcomeIds: readonly Uuid[];
}

/** The minimal view of a competency mastery the engine needs. */
export interface CompetencyMasteryView {
  readonly masteryLevel: MasteryLevel;
}

/**
 * AI-ready, read-only assessment indicators for a scope (a subject, a learner, an organization).
 * Descriptive analytics only — predictive models are a P2-D10 non-goal. Percentages are 0–100,
 * two-decimal; counts are whole numbers.
 */
export interface AssessmentIndicators {
  readonly assessmentsPublished: number;
  readonly assessmentsCompleted: number;
  readonly evaluationsTotal: number;
  readonly evaluationsApproved: number;
  readonly evaluationApprovalRate: number;
  readonly averagePerformance: number;
  readonly performanceConsistency: number;
  readonly competenciesTracked: number;
  readonly competencyMastery: number;
  readonly masteredCompetencies: number;
  readonly learningGaps: number;
  readonly outcomesTargeted: number;
  readonly outcomesCovered: number;
  readonly curriculumCoverage: number;
}
