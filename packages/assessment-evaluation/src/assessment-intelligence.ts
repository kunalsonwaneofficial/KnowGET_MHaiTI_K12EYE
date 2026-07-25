import { isProficientOrAbove, masteryScore } from "./competency-value";
import type {
  AssessmentIndicators,
  AssessmentView,
  CompetencyMasteryView,
  EvaluationView,
} from "./assessment-view";

/**
 * Compute descriptive assessment indicators for a scope from its assessments, evaluations and
 * competency masteries. Pure and deterministic; every rate is division-safe, two-decimal and
 * clamped to 0–100, and a scope with no activity yields zeroes rather than throwing. Descriptive
 * only — no predictive models (a P2-D10 non-goal). Competency mastery is measured **independently
 * of raw marks**: it reads mastery levels, never percentages.
 */
export function computeAssessmentIndicators(scope: {
  readonly assessments?: readonly AssessmentView[];
  readonly evaluations?: readonly EvaluationView[];
  readonly competencies?: readonly CompetencyMasteryView[];
}): AssessmentIndicators {
  const assessments = scope.assessments ?? [];
  const evaluations = scope.evaluations ?? [];
  const competencies = scope.competencies ?? [];

  const round = (value: number): number => Math.round(value * 100) / 100;
  const clampPct = (value: number): number => round(Math.min(100, Math.max(0, value)));

  const assessmentsPublished = assessments.filter(
    (a) => a.status !== "draft" && a.status !== "cancelled",
  ).length;
  const assessmentsCompleted = assessments.filter((a) => a.status === "completed").length;

  const evaluationsTotal = evaluations.length;
  const evaluationsApproved = evaluations.filter((e) => e.status === "approved").length;
  const evaluationApprovalRate =
    evaluationsTotal === 0 ? 0 : clampPct((100 * evaluationsApproved) / evaluationsTotal);

  // Performance: mean and consistency of the evaluated percentages.
  const percentages = evaluations.map((e) => e.percentage).filter((p): p is number => p !== null);
  const averagePerformance =
    percentages.length === 0
      ? 0
      : round(percentages.reduce((sum, p) => sum + p, 0) / percentages.length);
  let performanceConsistency = 100;
  if (percentages.length >= 2) {
    const mean = percentages.reduce((sum, p) => sum + p, 0) / percentages.length;
    const variance =
      percentages.reduce((sum, p) => sum + (p - mean) * (p - mean), 0) / percentages.length;
    performanceConsistency = clampPct(100 - Math.sqrt(variance));
  }

  // Competency mastery — read from mastery levels, never from marks.
  const competenciesTracked = competencies.length;
  const masteredCompetencies = competencies.filter((c) =>
    isProficientOrAbove(c.masteryLevel),
  ).length;
  const learningGaps = competenciesTracked - masteredCompetencies;
  const competencyMastery =
    competenciesTracked === 0
      ? 0
      : clampPct(
          (100 * competencies.reduce((sum, c) => sum + masteryScore(c.masteryLevel), 0)) /
            competenciesTracked,
        );

  // Curriculum coverage: distinct outcomes assessed by completed assessments over the outcomes
  // targeted by all active (non-draft, non-cancelled) assessments.
  const targeted = new Set<string>();
  for (const assessment of assessments) {
    if (assessment.status !== "draft" && assessment.status !== "cancelled") {
      for (const outcomeId of assessment.learningOutcomeIds) {
        targeted.add(outcomeId);
      }
    }
  }
  const covered = new Set<string>();
  for (const assessment of assessments) {
    if (assessment.status === "completed") {
      for (const outcomeId of assessment.learningOutcomeIds) {
        if (targeted.has(outcomeId)) {
          covered.add(outcomeId);
        }
      }
    }
  }
  const outcomesTargeted = targeted.size;
  const outcomesCovered = covered.size;
  const curriculumCoverage =
    outcomesTargeted === 0 ? 0 : clampPct((100 * outcomesCovered) / outcomesTargeted);

  return {
    assessmentsPublished,
    assessmentsCompleted,
    evaluationsTotal,
    evaluationsApproved,
    evaluationApprovalRate,
    averagePerformance,
    performanceConsistency,
    competenciesTracked,
    competencyMastery,
    masteredCompetencies,
    learningGaps,
    outcomesTargeted,
    outcomesCovered,
    curriculumCoverage,
  };
}
