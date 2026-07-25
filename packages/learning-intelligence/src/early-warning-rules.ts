import type { DimensionScore } from "./insight-value";
import type { EarlyWarningRule, FiredWarning } from "./insight-view";

/**
 * The pure early-warning engine — evaluates transparent threshold rules over a learner's
 * synthesized dimension scores and returns the warnings that fired. A rule fires when its
 * dimension's score is at or below its `maxScore`; the fired warning names the rule, the dimension
 * and the exact score that tripped it, so it is fully **explainable** — there is no opaque model
 * and nothing is predicted. Pure and deterministic; dimensions the learner has no score for are
 * skipped (absence of data never fires a warning).
 *
 * At most one warning per rule; when several rules fire for the same dimension all are returned
 * (each is a distinct, named reason), ordered by ascending observed score (most severe first).
 */
export function evaluateEarlyWarnings(
  dimensionScores: readonly DimensionScore[],
  rules: readonly EarlyWarningRule[],
): FiredWarning[] {
  const scoreByDimension = new Map(dimensionScores.map((d) => [d.dimension, d.score]));

  const fired: FiredWarning[] = [];
  for (const rule of rules) {
    const observed = scoreByDimension.get(rule.dimension);
    if (observed === undefined) {
      continue; // no data for this dimension — never fire on absence
    }
    if (observed <= rule.maxScore) {
      fired.push({
        ruleId: rule.id,
        dimension: rule.dimension,
        observedScore: observed,
        severity: rule.severity,
      });
    }
  }

  return fired.sort((a, b) => a.observedScore - b.observedScore);
}

/**
 * The platform's default early-warning rules — one per dimension at the `at_risk` and `critical`
 * thresholds of the shared 0–100 band scale. Institutions can supply their own; these are the
 * sensible, transparent defaults.
 */
export const DEFAULT_EARLY_WARNING_RULES: readonly EarlyWarningRule[] = [
  { id: "academic-at-risk", dimension: "academic", maxScore: 49.99, severity: "at_risk" },
  { id: "academic-critical", dimension: "academic", maxScore: 24.99, severity: "critical" },
  { id: "attendance-at-risk", dimension: "attendance", maxScore: 49.99, severity: "at_risk" },
  { id: "attendance-critical", dimension: "attendance", maxScore: 24.99, severity: "critical" },
  { id: "engagement-at-risk", dimension: "engagement", maxScore: 49.99, severity: "at_risk" },
  { id: "wellbeing-at-risk", dimension: "wellbeing", maxScore: 49.99, severity: "at_risk" },
  { id: "wellbeing-critical", dimension: "wellbeing", maxScore: 24.99, severity: "critical" },
  { id: "progression-at-risk", dimension: "progression", maxScore: 49.99, severity: "at_risk" },
];
