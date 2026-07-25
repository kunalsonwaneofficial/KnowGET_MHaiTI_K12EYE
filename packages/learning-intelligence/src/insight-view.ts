import type { DimensionScore, InsightDimension, RiskBand } from "./insight-value";

/**
 * The narrow views the pure engines consume. The learning-signal aggregate structurally satisfies
 * {@link LearningSignalView}, so the synthesis engine depends on no aggregate — the same
 * pure-engine-over-views pattern used across P2-D07…D10.
 */

/** The minimal view of a learning signal the synthesis engine needs (its dimension and reading). */
export interface LearningSignalView {
  readonly dimension: InsightDimension;
  readonly value: number;
}

/**
 * The synthesized learner-intelligence indicators — per-dimension health scores and an overall
 * learning-health score with its risk band, plus how many signals were considered. Descriptive
 * and explainable only (the driving dimensions are named); predictive modelling is a P2-D11
 * non-goal (deferred to the intelligence core, P2-D28). Scores are 0–100, two-decimal.
 */
export interface LearnerInsightIndicators {
  readonly dimensions: readonly DimensionScore[];
  readonly overallScore: number;
  readonly overallBand: RiskBand;
  readonly signalsConsidered: number;
  readonly dimensionsCovered: number;
}

/**
 * A transparent early-warning rule — fires when a dimension's synthesized score is at or below
 * `maxScore`. The rule id and dimension make every fired warning explainable (it names the rule
 * and the score that tripped it); no opaque model is involved.
 */
export interface EarlyWarningRule {
  readonly id: string;
  readonly dimension: InsightDimension;
  readonly maxScore: number;
  readonly severity: RiskBand;
}

/** A fired early-warning — the rule that tripped, the dimension, the observed score and severity. */
export interface FiredWarning {
  readonly ruleId: string;
  readonly dimension: InsightDimension;
  readonly observedScore: number;
  readonly severity: RiskBand;
}
