import type {
  FittedPoint,
  ForecastPoint,
  Observation,
  PredictionInterval,
  ProjectionPoint,
  ResidualStatistics,
  ScoredPoint,
  UncertaintyAssessment,
  UncertaintyInput,
} from "./forecast-view";
import type {
  CalibrationVerdict,
  ConfidenceLevel,
  UncertaintyGrade,
  UncertaintyReason,
} from "./forecast-value";
import {
  CALIBRATION_TOLERANCE,
  CONFIDENCE_MULTIPLIERS,
  MIN_CYCLES_FOR_SEASONAL,
  MIN_OBSERVATIONS_FOR_FORECAST,
  REQUIRED_CONFIDENCE_LEVEL,
  isSeasonalMethod,
  maxHorizonFor,
  roundValue,
  worseUncertainty,
} from "./forecast-value";

/**
 * The uncertainty engine: the half of the contract's rule that turns a projected number into a claim an
 * institution can weigh.
 *
 * Three things happen here and they are deliberately separate. Residuals are measured — how wrong this method
 * has actually been on this series. Intervals are built from that measurement and widened with horizon.
 * And the result is **graded**, with reasons, because a width is uninterpretable to a reader who does not know
 * whether the history under it was long enough, regular enough or stable enough to have earned it.
 *
 * Every interval here is empirical. Nothing assumes normality of the *data*; the multipliers are normal
 * quantiles applied to a spread that was measured, not asserted, and the difference matters: an interval
 * derived from an assumed distribution tells an institution how wrong the method would be in a world that
 * matched the assumption, while one derived from residuals tells them how wrong it has been in theirs.
 *
 * The engine never refuses. A forecast with too little history to say anything useful is graded `unusable` and
 * still carries its interval, because "we cannot tell you" stated with a number attached is auditable, and a
 * suppressed forecast just gets rebuilt in a spreadsheet where nobody grades it at all.
 */

// --- Grade thresholds ------------------------------------------------------------

/**
 * Where each grade begins, as the required interval's width divided by the projected level.
 *
 * The boundaries are judgements, and stating them as named constants is the point: an institution can read
 * exactly what the platform means by `moderate` rather than inferring it from behaviour. A forecast whose 80%
 * interval spans more than sixty per cent of the level it is projecting is not a forecast anybody should plan
 * on, and `unusable` says so instead of leaving a reader to notice.
 */
export const UNCERTAINTY_THRESHOLDS: Readonly<Record<"tight" | "moderate" | "wide", number>> = {
  tight: 0.1,
  moderate: 0.25,
  wide: 0.6,
};

/** Below this many residuals the measured spread is not an estimate of anything worth trusting. */
export const MIN_RESIDUALS_FOR_STABLE_SPREAD = 3;

/** A series whose standard deviation exceeds this fraction of its mean level is treated as volatile. */
export const VOLATILITY_THRESHOLD = 0.5;

/** A history missing more than this fraction of its span is treated as sparse rather than merely gappy. */
export const SPARSITY_THRESHOLD = 0.25;

// --- Residuals -------------------------------------------------------------------

/**
 * Summarize a method's in-sample residuals.
 *
 * The **root mean squared error** is what every interval below is built from, not the standard deviation, and
 * the choice is deliberate: the standard deviation measures spread *around the mean residual* and so forgives a
 * method that is consistently wrong in one direction, while RMSE counts that bias as the error it is. A method
 * that always undershoots by ten should not be able to quote a narrow interval on the grounds that it does so
 * reliably.
 *
 * The standard deviation is still reported, because the gap between it and the RMSE is exactly the bias, and a
 * reader comparing the two learns something no single number tells them.
 */
export const summarizeResiduals = (fitted: readonly FittedPoint[]): ResidualStatistics => {
  const residuals = fitted.map((point) => point.residual);
  const count = residuals.length;
  if (count === 0) {
    return { sampleSize: 0, meanAbsoluteError: 0, rootMeanSquaredError: 0, standardDeviation: 0 };
  }

  let absoluteTotal = 0;
  let squaredTotal = 0;
  let total = 0;
  for (const residual of residuals) {
    absoluteTotal += Math.abs(residual);
    squaredTotal += residual ** 2;
    total += residual;
  }
  const mean = total / count;

  let centredSquaredTotal = 0;
  for (const residual of residuals) centredSquaredTotal += (residual - mean) ** 2;

  return {
    sampleSize: count,
    meanAbsoluteError: roundValue(absoluteTotal / count),
    rootMeanSquaredError: roundValue(Math.sqrt(squaredTotal / count)),
    standardDeviation: roundValue(Math.sqrt(centredSquaredTotal / count)),
  };
};

/**
 * The spread an interval is built from: the measured RMSE, or — where the method left too few residuals to
 * measure one — the series' own mean absolute period-to-period movement.
 *
 * The fallback exists because some methods legitimately fit nothing. A moving average whose window spans the
 * whole series has no in-sample predictions to be wrong about, and the alternatives are both bad: an interval of
 * zero width claims certainty the method has not earned, and refusing to forecast at all hides a usable
 * projection behind a technicality. How much this metric ordinarily moves period to period is a crude but
 * honest stand-in, and it is always at least as wide as pretending there is no error.
 */
export const spreadFor = (residuals: ResidualStatistics, fallbackSpread: number): number => {
  if (
    residuals.sampleSize >= MIN_RESIDUALS_FOR_STABLE_SPREAD &&
    residuals.rootMeanSquaredError > 0
  ) {
    return residuals.rootMeanSquaredError;
  }
  const measured = residuals.sampleSize > 0 ? residuals.rootMeanSquaredError : 0;
  return Math.max(measured, Math.abs(fallbackSpread));
};

// --- Intervals -------------------------------------------------------------------

/**
 * How much the spread grows with horizon: the square root of the number of periods ahead.
 *
 * This is the random-walk widening, and it is used for every method rather than derived per method on purpose.
 * A method-specific error propagation would be more precise if the method were true, and every one of these
 * methods is an approximation — so the more defensible choice is the widening that assumes the least, applied
 * uniformly, where a reader comparing two forecasts is comparing like with like. It is also the direction that
 * errs safely: intervals grow with distance, never shrink, and no method can quote a tighter fourth period than
 * its first.
 */
export const horizonWidening = (horizon: number): number =>
  horizon <= 1 ? 1 : Math.sqrt(Math.max(1, horizon));

/**
 * Build the intervals around one projected value.
 *
 * The required level is always included, whatever the caller asked for. It is not a default that a caller can
 * override with an empty array — it is the contract's first rule, and the only way to be sure of it is for the
 * one function that constructs intervals to be incapable of omitting it.
 */
export const buildIntervals = (
  value: number,
  horizon: number,
  spread: number,
  levels: readonly ConfidenceLevel[] = [],
): readonly PredictionInterval[] => {
  const requested = new Set<ConfidenceLevel>(levels);
  requested.add(REQUIRED_CONFIDENCE_LEVEL);
  const widened = Math.abs(spread) * horizonWidening(horizon);

  return [...requested]
    .sort((a, b) => a - b)
    .map((level) => {
      const halfWidth = CONFIDENCE_MULTIPLIERS[level] * widened;
      return {
        level,
        lower: roundValue(value - halfWidth),
        upper: roundValue(value + halfWidth),
      };
    });
};

/**
 * Turn bare projections into forecast points — the only construction of a {@link ForecastPoint} in this package.
 *
 * Labels come from a lookup rather than being generated, because this engine has no clock and no calendar: only
 * the caller that owns the series knows what period 41 is called. A period with no supplied label gets its index
 * rendered plainly, which is honest and never wrong.
 */
export const attachIntervals = (
  points: readonly ProjectionPoint[],
  spread: number,
  levels: readonly ConfidenceLevel[] = [],
  labels: ReadonlyMap<number, string> = new Map(),
): readonly ForecastPoint[] =>
  points.map((point) => {
    const intervals = buildIntervals(point.value, point.horizon, spread, levels);
    const required = intervals.find((interval) => interval.level === REQUIRED_CONFIDENCE_LEVEL);
    return {
      period: point.period,
      horizon: point.horizon,
      label: labels.get(point.period) ?? `P${String(point.period)}`,
      value: point.value,
      intervals,
      intervalWidth: roundValue(required === undefined ? 0 : required.upper - required.lower),
    };
  });

/** The labels of a history, keyed by period — the lookup {@link attachIntervals} reads. */
export const labelsOf = (observations: readonly Observation[]): ReadonlyMap<number, string> =>
  new Map(observations.map((observation) => [observation.period, observation.label] as const));

// --- Grading ---------------------------------------------------------------------

/** The grade implied by a relative width alone, before any reason escalates it. */
const gradeFromWidth = (relativeWidth: number | null): UncertaintyGrade => {
  // A level of zero makes the ratio undefined, and undefined is not an argument for confidence: a forecast
  // whose width cannot be put in proportion to anything starts at `wide` and can only get worse from there.
  if (relativeWidth === null) return "wide";
  if (relativeWidth < UNCERTAINTY_THRESHOLDS.tight) return "tight";
  if (relativeWidth < UNCERTAINTY_THRESHOLDS.moderate) return "moderate";
  if (relativeWidth < UNCERTAINTY_THRESHOLDS.wide) return "wide";
  return "unusable";
};

/**
 * Grade a forecast's uncertainty and say why.
 *
 * The grade is the *worst* of the width-implied grade and every floor a reason imposes. Taking the worst rather
 * than averaging is the whole design: a forecast can have a narrow interval and still be worthless because the
 * three observations behind it were never going to support the claim, and an arithmetic that let a tight width
 * offset a short history would produce exactly the confidently wrong answer this contract exists to prevent.
 *
 * Reasons are reported whether or not they moved the grade. `long_horizon` on a forecast still graded `tight`
 * is useful information — it tells a reader which part of the forecast to distrust first if it turns out wrong.
 */
export const assessUncertainty = (input: UncertaintyInput): UncertaintyAssessment => {
  const reasons = new Set<UncertaintyReason>();
  const { inspection, statistics, residuals, horizon } = input;
  const maxHorizon = maxHorizonFor(inspection.count);

  const furthest = input.points[input.points.length - 1];
  const level = furthest === undefined ? 0 : Math.abs(furthest.value);
  const width = furthest === undefined ? 0 : furthest.intervalWidth;
  const relativeWidth = level === 0 ? null : roundValue(width / level);

  let grade = gradeFromWidth(relativeWidth);
  const escalate = (floor: UncertaintyGrade): void => {
    grade = worseUncertainty(grade, floor);
  };

  if (inspection.count < MIN_OBSERVATIONS_FOR_FORECAST * 2) {
    reasons.add("short_history");
    escalate("moderate");
  }

  if (inspection.gapPeriods.length > 0) {
    reasons.add("sparse_history");
    const sparsity =
      inspection.contiguousSpan === 0
        ? 0
        : inspection.gapPeriods.length / inspection.contiguousSpan;
    escalate(sparsity > SPARSITY_THRESHOLD ? "wide" : "moderate");
  }

  if (
    statistics.mean !== 0 &&
    statistics.standardDeviation / Math.abs(statistics.mean) > VOLATILITY_THRESHOLD
  ) {
    reasons.add("volatile_history");
    escalate("wide");
  }

  if (maxHorizon > 0 && horizon > maxHorizon / 2) {
    reasons.add("long_horizon");
    escalate("moderate");
  }

  if (residuals.sampleSize < MIN_RESIDUALS_FOR_STABLE_SPREAD) {
    reasons.add("unstable_residuals");
    escalate("wide");
  }

  if (isSeasonalMethod(input.method) && inspection.completeCycles < MIN_CYCLES_FOR_SEASONAL) {
    reasons.add("seasonal_cycle_incomplete");
    escalate("wide");
  }

  return {
    grade,
    reasons: [...reasons].sort(),
    residuals,
    relativeWidth,
    maxHorizon,
  };
};

// --- Coverage and calibration ----------------------------------------------------

/**
 * The fraction of actuals that fell inside the stated interval, as a percentage.
 *
 * This is the check that keeps the contract's first rule from being a formality. An interval is a promise about
 * how often the outcome will land inside it, and coverage is the only way to find out whether the promise was
 * kept. Points carrying no interval at the requested level are skipped rather than counted as misses — they are
 * a gap in the record, not evidence about the interval — and the denominator is reported alongside so nobody
 * reads a coverage figure computed over two points as though it were computed over two hundred.
 */
export const computeCoverage = (
  scored: readonly ScoredPoint[],
  level: ConfidenceLevel = REQUIRED_CONFIDENCE_LEVEL,
): { readonly coverage: number; readonly sampleSize: number } => {
  let covered = 0;
  let counted = 0;
  for (const point of scored) {
    const interval = point.intervals.find((candidate) => candidate.level === level);
    if (interval === undefined) continue;
    counted += 1;
    if (point.actual >= interval.lower && point.actual <= interval.upper) covered += 1;
  }
  return {
    coverage: counted === 0 ? 0 : roundValue((covered / counted) * 100),
    sampleSize: counted,
  };
};

/**
 * Whether the intervals told the truth.
 *
 * `overconfident` — catching fewer outcomes than claimed — is the dangerous direction, and it is the one a
 * forecasting system drifts into unaided, because narrow intervals look like competence. `underconfident` is
 * reported too rather than treated as safe: intervals wide enough to catch everything have stopped saying
 * anything, and an institution planning against them is planning against no forecast at all.
 *
 * A backtest with nothing to score is `calibrated` by default, which is the neutral answer. It is the caller's
 * business to notice that the sample size was zero — reported beside it — rather than this function's to invent
 * an accusation from an absence of evidence.
 */
export const judgeCalibration = (
  coverage: number,
  level: ConfidenceLevel = REQUIRED_CONFIDENCE_LEVEL,
): CalibrationVerdict => {
  if (coverage < level - CALIBRATION_TOLERANCE) return "overconfident";
  if (coverage > level + CALIBRATION_TOLERANCE) return "underconfident";
  return "calibrated";
};
