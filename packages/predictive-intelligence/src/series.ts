import type {
  HoldoutSplit,
  Observation,
  SeriesInspection,
  SeriesIssueCode,
  SeriesStatistics,
  SeriesView,
} from "./forecast-view";
import {
  MIN_CYCLES_FOR_SEASONAL,
  MIN_OBSERVATIONS_FOR_FORECAST,
  isFiniteValue,
  maxHorizonFor,
  roundValue,
} from "./forecast-value";

/**
 * The series engine: everything that can be known about a history *before* anyone tries to forecast from it.
 *
 * It is first because every later engine depends on its verdict, and because the great majority of bad
 * forecasts are not bad arithmetic — they are correct arithmetic over a series that was too short, gappy,
 * duplicated or misaligned to carry the claim being made from it. Finding that out here, once, and reporting it
 * in codes that survive onto the run and into the API is worth more than any refinement further down.
 *
 * Every function is pure and total: no clock, no randomness, no exceptions on malformed input. A series with
 * duplicate periods and a non-finite value is described, not thrown at, because the caller that most needs to
 * know is a data steward looking at a list of what is wrong with their data — and an exception gives them the
 * first problem only.
 */

// --- Ordering and the grid -------------------------------------------------------

/**
 * Observations sorted by period, ascending. Sorting is by period alone and is stable, so duplicate periods keep
 * their given order and {@link inspectSeries} can report the duplication rather than silently picking a winner.
 */
export const sortObservations = (observations: readonly Observation[]): readonly Observation[] =>
  [...observations].sort((a, b) => a.period - b.period);

/**
 * The periods missing from an ordered series — every integer between the first and last that carries no
 * observation.
 *
 * Gaps are found by walking the range rather than by comparing counts, because "you are missing four months" is
 * an answer nobody can act on and "you are missing March, April, September and December" is one somebody can go
 * and fix. Duplicates are tolerated here and reported separately: a duplicated period is still a covered one,
 * and conflating the two problems would report a gap that does not exist.
 */
export const findGapPeriods = (observations: readonly Observation[]): readonly number[] => {
  const sorted = sortObservations(observations);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) return [];

  const present = new Set<number>(sorted.map((observation) => observation.period));
  const gaps: number[] = [];
  for (let period = first.period + 1; period < last.period; period += 1) {
    if (!present.has(period)) gaps.push(period);
  }
  return gaps;
};

/**
 * How many whole seasonal cycles of history a series holds, measured across its span rather than its count.
 *
 * Span, not count, is the honest measure: three years of monthly data with eleven months missing is still three
 * years of *seasonal* coverage in the sense that matters — every month of the year has been seen — whereas
 * thirty-six consecutive observations that happen to be dense would be no better. The gaps are reported on
 * their own account and widen the interval there; they do not also pretend the seasons never came round.
 *
 * Returns `0` when no cycle is declared, because an undeclared season has no cycles rather than infinitely many.
 */
export const countCompleteCycles = (
  observations: readonly Observation[],
  cycleLength: number | null,
): number => {
  if (cycleLength === null || !Number.isInteger(cycleLength) || cycleLength < 2) return 0;
  const sorted = sortObservations(observations);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) return 0;
  return Math.floor((last.period - first.period + 1) / cycleLength);
};

/**
 * A period's position within the seasonal cycle, relative to the series' first observed period.
 *
 * Positions are relative to the series' own origin rather than to a calendar, so a series that begins in April
 * has April at position 0 and needs no convention about where a year starts. `seasonal_naive` reads this to
 * find the same position one cycle back, and using an absolute origin would have made the method's answer
 * depend on an arbitrary choice made elsewhere.
 */
export const seasonalPosition = (
  period: number,
  originPeriod: number,
  cycleLength: number,
): number => {
  if (!Number.isInteger(cycleLength) || cycleLength < 2) return 0;
  const offset = (period - originPeriod) % cycleLength;
  return offset < 0 ? offset + cycleLength : offset;
};

// --- Inspection ------------------------------------------------------------------

/**
 * Inspect a series and report everything wrong with it, plus whether it can carry a forecast at all.
 *
 * `forecastable` is narrower than "no issues": it is false only for the faults that make the arithmetic
 * meaningless — nothing to fit, too little to fit, a period claimed twice, or a value that is not a number.
 * Gaps and an incomplete seasonal cycle are real issues that travel to the uncertainty engine and widen the
 * interval, but they do not block, because a platform that refuses to forecast from imperfect institutional data
 * refuses to forecast from institutional data.
 */
export const inspectSeries = (series: SeriesView): SeriesInspection => {
  const issues = new Set<SeriesIssueCode>();
  const sorted = sortObservations(series.observations);
  const count = sorted.length;
  const first = sorted[0];
  const last = sorted[count - 1];

  if (count === 0) issues.add("no_observations");
  else if (count < MIN_OBSERVATIONS_FOR_FORECAST) issues.add("below_observation_floor");

  const seen = new Set<number>();
  let duplicated = false;
  let nonFinite = false;
  for (const observation of sorted) {
    if (seen.has(observation.period)) duplicated = true;
    seen.add(observation.period);
    if (!Number.isInteger(observation.period)) nonFinite = true;
    if (!isFiniteValue(observation.value)) nonFinite = true;
  }
  if (duplicated) issues.add("duplicate_period");
  if (nonFinite) issues.add("non_finite_value");

  // Reported against the order the caller supplied, not the sorted copy: a store that hands back rows in the
  // wrong order is a defect worth surfacing even though every engine here sorts defensively anyway.
  const givenOutOfOrder = series.observations.some(
    (observation, index) =>
      index > 0 && observation.period < (series.observations[index - 1]?.period ?? 0),
  );
  if (givenOutOfOrder) issues.add("unordered_periods");

  const gapPeriods = findGapPeriods(sorted);
  if (gapPeriods.length > 0) issues.add("has_gaps");

  if (
    series.cycleLength !== null &&
    (!Number.isInteger(series.cycleLength) || series.cycleLength < 2)
  ) {
    issues.add("invalid_cycle_length");
  }

  const completeCycles = countCompleteCycles(sorted, series.cycleLength);
  if (
    series.cycleLength !== null &&
    Number.isInteger(series.cycleLength) &&
    series.cycleLength >= 2 &&
    completeCycles < MIN_CYCLES_FOR_SEASONAL
  ) {
    issues.add("seasonal_cycle_incomplete");
  }

  const forecastable =
    count >= MIN_OBSERVATIONS_FOR_FORECAST &&
    !duplicated &&
    !nonFinite &&
    maxHorizonFor(count) >= 1;

  return {
    seriesKey: series.seriesKey,
    count,
    firstPeriod: first?.period ?? null,
    lastPeriod: last?.period ?? null,
    contiguousSpan: first === undefined || last === undefined ? 0 : last.period - first.period + 1,
    gapPeriods,
    completeCycles,
    forecastable,
    issues: [...issues].sort(),
  };
};

// --- Statistics ------------------------------------------------------------------

/**
 * Summary statistics over a series' values, every derived figure rounded to the package's fixed precision.
 *
 * The standard deviation is the **population** form (divided by `n`, not `n - 1`) because these values are the
 * whole of the history that exists, not a sample drawn from a larger one that does. The uncertainty engine
 * separately uses residual spread rather than this figure for its intervals; this is descriptive, and being
 * clear about which is which is how the two never get quietly swapped.
 *
 * An empty series yields zeros rather than `NaN`. Callers reach here only past {@link inspectSeries}, and a
 * degenerate zero is a far kinder thing to find in a log than a `NaN` that has already propagated.
 */
export const computeStatistics = (observations: readonly Observation[]): SeriesStatistics => {
  const values = sortObservations(observations).map((observation) => observation.value);
  const count = values.length;
  if (count === 0) {
    return {
      count: 0,
      mean: 0,
      min: 0,
      max: 0,
      standardDeviation: 0,
      meanAbsoluteChange: 0,
    };
  }

  let total = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    total += value;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const mean = total / count;

  let squaredTotal = 0;
  for (const value of values) squaredTotal += (value - mean) ** 2;
  const standardDeviation = Math.sqrt(squaredTotal / count);

  let changeTotal = 0;
  for (let index = 1; index < count; index += 1) {
    changeTotal += Math.abs((values[index] ?? 0) - (values[index - 1] ?? 0));
  }
  const meanAbsoluteChange = count > 1 ? changeTotal / (count - 1) : 0;

  return {
    count,
    mean: roundValue(mean),
    min: roundValue(min),
    max: roundValue(max),
    standardDeviation: roundValue(standardDeviation),
    meanAbsoluteChange: roundValue(meanAbsoluteChange),
  };
};

// --- Backtest splitting ----------------------------------------------------------

/**
 * The largest holdout a series can afford: never more than what the horizon ceiling would permit forecasting,
 * and never so large that the remaining training history falls below the observation floor.
 *
 * Both bounds are needed and they bind at different sizes. Without the first, a backtest could score a model
 * over a span the platform would refuse to forecast — reporting accuracy for a claim it will not make. Without
 * the second, a long holdout starves the training history and the model is scored on a fit nobody would have
 * published.
 */
export const maxHoldoutSize = (observationCount: number): number => {
  const byTrainingFloor = observationCount - MIN_OBSERVATIONS_FOR_FORECAST;
  const byHorizonCeiling = maxHorizonFor(observationCount);
  return Math.max(0, Math.min(byTrainingFloor, byHorizonCeiling));
};

/**
 * Split a series chronologically into training history and a holdout to score against.
 *
 * The requested size is clamped to {@link maxHoldoutSize} rather than rejected, so a caller asking for more
 * holdout than the series can afford gets the largest honest split instead of an error — and gets it with the
 * training set still above the observation floor, which is the invariant that makes the resulting score mean
 * anything. A request of zero, or a series too short to split at all, yields an empty holdout and the whole
 * series as training: no backtest is possible, and returning that plainly is better than inventing one.
 */
export const splitHoldout = (
  observations: readonly Observation[],
  requestedHoldoutSize: number,
): HoldoutSplit => {
  const sorted = sortObservations(observations);
  const cap = maxHoldoutSize(sorted.length);
  const size = Math.max(
    0,
    Math.min(cap, Number.isInteger(requestedHoldoutSize) ? requestedHoldoutSize : 0),
  );
  if (size === 0) return { train: sorted, holdout: [] };
  return {
    train: sorted.slice(0, sorted.length - size),
    holdout: sorted.slice(sorted.length - size),
  };
};
