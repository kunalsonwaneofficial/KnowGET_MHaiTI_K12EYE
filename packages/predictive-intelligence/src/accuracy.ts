import type { AccuracyScores, ForecastPoint, Observation, ScoredPoint } from "./forecast-view";
import type { ConfidenceLevel } from "./forecast-value";
import { REQUIRED_CONFIDENCE_LEVEL, roundValue } from "./forecast-value";
import { computeCoverage, judgeCalibration } from "./uncertainty";

/**
 * The accuracy engine: what a model actually did on periods it was not allowed to see.
 *
 * In-sample fit is not accuracy and the distinction is the reason this engine is separate from the projection
 * one. A method can fit a history arbitrarily well and forecast it badly, and a platform that reports the first
 * as though it were the second is selling confidence it has not earned. Everything here consumes a holdout: the
 * forecast was made from the training half, the actuals come from the half withheld, and the comparison is
 * therefore a genuine test rather than a description of a fit.
 *
 * Two scores carry the real weight. **Skill** compares the method's error against the naive baseline — "next
 * period looks like this one" — and it is the only number that answers "was this model worth building". A model
 * with an impressive-looking RMSE and a negative skill score is a model the institution would be better off
 * without, and reporting the RMSE alone would never reveal it. **Interval coverage** turns the contract's first
 * rule from a formality into a check: an 80% interval that caught 40% of outcomes has been stating a confidence
 * it never had, and no amount of low absolute error redeems that.
 *
 * Every function is pure and total: an empty holdout produces zeros and a neutral verdict rather than a
 * throw, because the caller — a backtest aggregate — needs to record that nothing could be scored, and an
 * exception loses the distinction between "scored badly" and "could not be scored".
 */

// --- Pairing ---------------------------------------------------------------------

/**
 * Pair forecast points with what actually happened, on period.
 *
 * Matching on `period` rather than on position is not defensiveness — it is the only correct way to do it. A
 * holdout with a gap, or an actual arriving out of order, would silently score forecast period 13 against the
 * actual for period 14 under positional matching, and the resulting error would be attributed to the model
 * rather than to the join. Forecast periods without an actual are dropped, because a period nobody observed
 * cannot score anything; the shrunken sample size is reported on the scores so the omission is never invisible.
 */
export const scoreAgainstActuals = (
  points: readonly ForecastPoint[],
  actuals: readonly Observation[],
): readonly ScoredPoint[] => {
  const byPeriod = new Map(actuals.map((actual) => [actual.period, actual.value] as const));
  const scored: ScoredPoint[] = [];
  for (const point of points) {
    const actual = byPeriod.get(point.period);
    if (actual === undefined) continue;
    scored.push({
      period: point.period,
      horizon: point.horizon,
      forecast: point.value,
      actual,
      intervals: point.intervals,
    });
  }
  return scored.sort((a, b) => a.period - b.period);
};

// --- Error measures --------------------------------------------------------------

/** Mean absolute error over scored points. Zero for an empty holdout. */
export const meanAbsoluteError = (scored: readonly ScoredPoint[]): number => {
  if (scored.length === 0) return 0;
  let total = 0;
  for (const point of scored) total += Math.abs(point.forecast - point.actual);
  return roundValue(total / scored.length);
};

/** Root mean squared error over scored points. Zero for an empty holdout. */
export const rootMeanSquaredError = (scored: readonly ScoredPoint[]): number => {
  if (scored.length === 0) return 0;
  let total = 0;
  for (const point of scored) total += (point.forecast - point.actual) ** 2;
  return roundValue(Math.sqrt(total / scored.length));
};

/**
 * Mean absolute percentage error, or `null` where any actual is zero.
 *
 * `null` rather than infinity and rather than skipping the offending points. Infinity poisons the average and
 * turns one zero into an unreadable score for the whole holdout; dropping the point quietly reports a percentage
 * computed over a different set than the one named, which is worse than reporting nothing because it looks like
 * an answer. Institutional series hit zero routinely — a fee head with no collections in a vacation month — so
 * this is the common case, not the edge one, and MAPE simply does not apply to it.
 */
export const meanAbsolutePercentageError = (scored: readonly ScoredPoint[]): number | null => {
  if (scored.length === 0) return null;
  if (scored.some((point) => point.actual === 0)) return null;
  let total = 0;
  for (const point of scored) {
    total += Math.abs((point.forecast - point.actual) / point.actual);
  }
  return roundValue((total / scored.length) * 100);
};

/**
 * How much better than the naive baseline this model was: `1 - modelError / baselineError`.
 *
 * Positive means it beat "next period looks like this one", zero means it matched it, negative means the
 * institution would have done better with no model at all. The score is deliberately unbounded below — a model
 * three times worse than doing nothing scores −2, and clamping that to zero would hide exactly the result
 * somebody needs to see before publishing.
 *
 * A baseline with no error is the interesting boundary. If the model matched it, both were perfect and the
 * honest answer is zero skill: the model added nothing because there was nothing to add. If the model did worse,
 * the baseline was perfect and the model was not, which is the worst possible standing against a baseline, and
 * −1 says so on the same scale as every other score rather than as a special value.
 */
export const skillScore = (modelError: number, baselineError: number): number => {
  if (baselineError === 0) return modelError === 0 ? 0 : -1;
  return roundValue(1 - modelError / baselineError);
};

// --- The scores ------------------------------------------------------------------

/**
 * Score a holdout: error measures, skill against the naive baseline, and whether the intervals told the truth.
 *
 * The baseline is passed in already scored rather than derived here, because the only baseline worth comparing
 * against is one produced by the same split, the same pairing and the same holdout — and the way to guarantee
 * that is to make the caller run both through this engine rather than to have this engine quietly project one.
 * A caller with no baseline gets a skill score of zero, which reads as "unproven" rather than "good".
 *
 * Coverage is measured at the required level by default. A model may quote more levels, but the platform's
 * calibration verdict is about the one every forecast must carry, so the honesty check cannot be moved to a
 * level that happens to look better.
 *
 * Where nothing could be measured at that level — an empty holdout, or points that never quoted it — the verdict
 * is `calibrated` rather than the `overconfident` a zero coverage figure would otherwise produce. Zero coverage
 * out of zero points is not a model catching nothing; it is a model that was never tested, and convicting it on
 * an absence of evidence would put a false accusation on the record beside a sample size of nought.
 */
export const computeAccuracy = (
  scored: readonly ScoredPoint[],
  baseline: readonly ScoredPoint[] = [],
  level: ConfidenceLevel = REQUIRED_CONFIDENCE_LEVEL,
): AccuracyScores => {
  const mae = meanAbsoluteError(scored);
  const rmse = rootMeanSquaredError(scored);
  const baselineMae = meanAbsoluteError(baseline);
  const { coverage, sampleSize: coverageSample } = computeCoverage(scored, level);

  return {
    sampleSize: scored.length,
    meanAbsoluteError: mae,
    rootMeanSquaredError: rmse,
    meanAbsolutePercentageError: meanAbsolutePercentageError(scored),
    skillScore: baseline.length === 0 ? 0 : skillScore(mae, baselineMae),
    intervalCoverage: coverage,
    coverageLevel: level,
    calibration: coverageSample === 0 ? "calibrated" : judgeCalibration(coverage, level),
  };
};

/**
 * Whether a model earned its place: it beat the baseline and its intervals were not overconfident.
 *
 * Both conditions, because either alone can be gamed by a model that is wrong in a comfortable direction. A
 * model with excellent skill and overconfident intervals produces good central estimates surrounded by a range
 * nobody should have planned inside; a model with honest intervals and no skill is an accurate account of the
 * fact that it knows nothing. Underconfidence does not disqualify — intervals wider than they needed to be are
 * a cost, not a lie — and saying so here is what keeps the check about honesty rather than about polish.
 *
 * A holdout with nothing in it never qualifies. There is no evidence, and absence of evidence is not a pass.
 */
export const isPublishable = (scores: AccuracyScores): boolean =>
  scores.sampleSize > 0 && scores.skillScore > 0 && scores.calibration !== "overconfident";
