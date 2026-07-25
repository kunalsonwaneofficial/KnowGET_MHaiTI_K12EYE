import {
  bandFor,
  type DimensionScore,
  INSIGHT_DIMENSIONS,
  needsAttention,
  RISK_BANDS,
  type RiskBand,
} from "./insight-value";
import type {
  CohortIndicators,
  CohortProfileView,
  LearnerInsightIndicators,
  LearningSignalView,
} from "./insight-view";

/**
 * The pure learning-intelligence engine — synthesizes a learner's cross-domain descriptive signals
 * into a unified learning-health picture. For each dimension it averages the 0–100 health readings
 * its signals carry (higher is healthier), bands each dimension, and averages the covered
 * dimensions (equal weight, so no single dimension dominates) into an overall learning-health score
 * and band. Pure and deterministic; every reading is clamped to 0–100 and two-decimal, and a
 * learner with no signals yields zeroes with `dimensionsCovered = 0` (the data-sufficiency signal)
 * rather than throwing.
 *
 * This is **synthesis, not recomputation and not prediction**: the readings come from the upstream
 * domains' own indicators, and the output is descriptive and explainable (the covered dimensions
 * are named). Predictive/ML modelling is a P2-D11 non-goal — deferred to the intelligence core
 * (P2-D28), which layers confidence-bounded forecasting on top of this descriptive base.
 */
export function synthesizeLearnerInsight(
  signals: readonly LearningSignalView[],
): LearnerInsightIndicators {
  const round = (value: number): number => Math.round(value * 100) / 100;
  const clamp = (value: number): number => Math.min(100, Math.max(0, value));

  const dimensions: DimensionScore[] = [];
  for (const dimension of INSIGHT_DIMENSIONS) {
    const readings = signals.filter((s) => s.dimension === dimension).map((s) => clamp(s.value));
    if (readings.length === 0) {
      continue;
    }
    const score = round(readings.reduce((sum, v) => sum + v, 0) / readings.length);
    dimensions.push({ dimension, score, band: bandFor(score), signalCount: readings.length });
  }

  const overallScore =
    dimensions.length === 0
      ? 0
      : round(dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length);

  return {
    dimensions,
    overallScore,
    overallBand: bandFor(overallScore),
    signalsConsidered: signals.length,
    dimensionsCovered: dimensions.length,
  };
}

/**
 * The pure cohort-rollup engine — summarizes a set of learner insight profiles into a descriptive
 * cohort picture: how many learners have data, their average learning-health and band, the
 * distribution across risk bands, and how many need attention (at_risk or critical). Profiles with
 * no data (`dimensionsCovered = 0`) are excluded so an un-synthesized learner never drags the
 * average down. Pure and deterministic; leadership-facing and descriptive only.
 */
export function summarizeCohort(profiles: readonly CohortProfileView[]): CohortIndicators {
  const round = (value: number): number => Math.round(value * 100) / 100;

  const bandDistribution: Record<RiskBand, number> = {
    on_track: 0,
    watch: 0,
    at_risk: 0,
    critical: 0,
  };
  for (const band of RISK_BANDS) {
    bandDistribution[band] = 0;
  }

  const considered = profiles.filter((p) => p.dimensionsCovered > 0);
  let needing = 0;
  for (const profile of considered) {
    bandDistribution[profile.overallBand] += 1;
    if (needsAttention(profile.overallBand)) {
      needing += 1;
    }
  }

  const averageLearningHealth =
    considered.length === 0
      ? 0
      : round(considered.reduce((sum, p) => sum + p.overallScore, 0) / considered.length);

  return {
    learnersConsidered: considered.length,
    averageLearningHealth,
    averageBand: bandFor(averageLearningHealth),
    bandDistribution,
    learnersNeedingAttention: needing,
  };
}
