import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { ForecastMethod } from "./forecast-value";
import { isHorizonAdmissible } from "./forecast-value";
import type { AccuracyScores, ResolvedProjectionParameters, ScoredPoint } from "./forecast-view";
import {
  HoldoutTooSmallError,
  ModelNotPublishableError,
  SeriesNotForecastableError,
} from "./errors";
import { computeAccuracy, isPublishable, meanAbsoluteError, scoreAgainstActuals } from "./accuracy";
import type { ForecastModel } from "./forecast-model";
import type { ObservationSeries } from "./observation-series";
import { toSeriesView } from "./observation-series";
import { project, projectBaseline } from "./projection";
import { computeStatistics, inspectSeries, maxHoldoutSize, splitHoldout } from "./series";
import { attachIntervals, spreadFor, summarizeResiduals } from "./uncertainty";

/**
 * What a model is actually worth, measured on periods it was not allowed to see.
 *
 * Every other record in this package describes a claim about the future. This one is the only evidence the
 * platform holds that any of those claims are worth reading. A model can be declared, published, pinned by a
 * hundred runs and cited in a board paper without a single number in it ever having been checked against what
 * happened; a backtest is the check, and {@link requireEarnedPublication} is what makes passing it a
 * precondition rather than a courtesy.
 *
 * **The split is chronological and the training set is what the model fits.** The model is fitted on the earlier
 * observations and scored on the later ones, never both. A model scored on periods inside its own fitting window
 * is being measured on memory rather than prediction, and it will look excellent right up until an institution
 * plans against it.
 *
 * **The baseline travels with the score.** An error figure alone is unreadable — a mean absolute error of four
 * is superb for a headcount and catastrophic for an attendance percentage — so every backtest also runs the
 * naive projection over the same holdout and reports the skill against it. "Did this beat doing nothing" is the
 * only accuracy question that answers itself, and it is the one {@link isPublishable} turns on.
 *
 * **Intervals are scored too, not just points.** Coverage against the required level is what turns the
 * contract's first rule from a formality into a measurement: an 80% interval that catches half its outcomes has
 * been stating a confidence it never had, and a model that does that is refused publication however good its
 * central estimates are. Underconfidence is reported and does not disqualify — intervals wider than they needed
 * to be cost something, but they do not mislead.
 *
 * **The holdout is bounded by what the training set could have published.** {@link maxHoldoutSize} bounds it by
 * the horizon ceiling of the *whole* series, which is the right bound for "could this series afford a split at
 * all"; the forecast being scored, though, was derived from the training prefix alone, and the contract's
 * horizon rule is about the history a forecast was derived from. So the holdout is narrowed again until the
 * horizon it implies is admissible against the training count that remains. Without that second narrowing a
 * twelve-period series would be scored six periods ahead from six observations — a span
 * {@link produceForecastRun} would refuse outright — and the resulting number would be an accuracy figure for a
 * claim the platform will not make.
 *
 * **A draft may be backtested; that is the point.** No status gate stands in front of this, because the
 * ordinary sequence is draft, backtest, publish. A retired model may be backtested too — asking how a method the
 * institution has moved on from would have done is a legitimate retrospective, and `modelVersion` records
 * exactly which version was scored, `0` where it was still a draft.
 *
 * The record is immutable once written. A model that has been retuned earns a new backtest rather than an edit,
 * so a score can always be read beside the version it was a score of.
 */

// --- The aggregate ---------------------------------------------------------------

export interface Backtest {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly seriesId: Uuid;
  readonly seriesKey: string;
  /** The series version scored against. A later correction does not change what this backtest measured. */
  readonly seriesVersion: number;
  readonly modelId: Uuid;
  readonly modelKey: string;
  /** The version scored. `0` where the model was still a draft, which is the ordinary case. */
  readonly modelVersion: number;
  readonly method: ForecastMethod;
  /** As resolved against the *training* prefix, which is the history the scored forecast actually had. */
  readonly parameters: ResolvedProjectionParameters;
  /** How many observations were held back. Also the horizon the model was asked to reach. */
  readonly holdoutSize: number;
  readonly trainingCount: number;
  readonly firstHoldoutPeriod: number;
  readonly lastHoldoutPeriod: number;
  /** Each forecast point beside what actually happened. The atoms every score below was computed from. */
  readonly scored: readonly ScoredPoint[];
  readonly scores: AccuracyScores;
  /** The naive projection's error over the same holdout — what the skill score was measured against. */
  readonly baselineMeanAbsoluteError: number;
  /** {@link isPublishable} at the moment of scoring, frozen so the verdict and its evidence never diverge. */
  readonly publishable: boolean;
  readonly ranByUserId: Uuid | null;
  readonly ranAt: ISODateString;
  readonly createdAt: ISODateString;
  /** Present for house shape. A backtest is never edited, so this never moves off {@link Backtest.createdAt}. */
  readonly updatedAt: ISODateString;
}

export interface BacktestParams {
  readonly series: ObservationSeries;
  /** Any status. Backtesting is what earns publication, so refusing a draft here would invert the sequence. */
  readonly model: ForecastModel;
  /** Clamped to what the series can afford. Defaults to the largest honest holdout. */
  readonly holdoutSize?: number;
  readonly ranByUserId?: Uuid | null;
}

// --- Running ---------------------------------------------------------------------

/**
 * Score a model against history it was not fitted on.
 *
 * The requested holdout is clamped into what the series can afford rather than refused, mirroring
 * {@link splitHoldout} and {@link resolveParameters}: a caller who asked for eight periods out of twelve has
 * made a correctable mistake, and returning the largest honest split with `holdoutSize` recorded leaves them
 * with a score and an exact statement of what it was a score of. {@link HoldoutTooSmallError} is reserved for
 * the case where no honest split exists at all, so the error, when it fires, is always literally true.
 *
 * Both the model and the baseline get intervals from their own residuals against the same fallback spread, and
 * both are scored by period rather than by position. A gap inside the holdout leaves a projected period with no
 * actual to score against; it is dropped and the shrunken `sampleSize` says so, which is the honest outcome —
 * positional matching would have scored period 13's forecast against period 14 and blamed the model.
 */
export function runBacktest(params: BacktestParams): Backtest {
  const { series, model } = params;

  const view = toSeriesView(series);
  const inspection = inspectSeries(view);
  if (!inspection.forecastable) {
    throw new SeriesNotForecastableError(series.seriesKey, inspection.issues);
  }

  const affordable = affordableHoldout(inspection.count);
  if (affordable === 0) throw new HoldoutTooSmallError(series.seriesKey, inspection.count);

  const split = splitHoldout(view.observations, clampHoldout(params.holdoutSize, affordable));
  const first = split.holdout[0];
  const last = split.holdout[split.holdout.length - 1];
  if (first === undefined || last === undefined) {
    throw new HoldoutTooSmallError(series.seriesKey, inspection.count);
  }

  const horizon = split.holdout.length;
  const statistics = computeStatistics(split.train);

  // No labels are attached to either projection. The holdout's periods are observed and do carry labels, but
  // `scoreAgainstActuals` keeps the period and drops the label, so a lookup here would be work whose result
  // nothing reads — and a reader finding one would reasonably infer the label survives onto the score.
  const projection = project(
    model.method,
    split.train,
    horizon,
    model.parameters,
    series.cycleLength,
  );
  const points = attachIntervals(
    projection.points,
    spreadFor(summarizeResiduals(projection.fitted), statistics.meanAbsoluteChange),
    model.confidenceLevels,
  );

  const baseline = projectBaseline(split.train, horizon);
  const baselinePoints = attachIntervals(
    baseline.points,
    spreadFor(summarizeResiduals(baseline.fitted), statistics.meanAbsoluteChange),
    model.confidenceLevels,
  );

  const scored = scoreAgainstActuals(points, split.holdout);
  const baselineScored = scoreAgainstActuals(baselinePoints, split.holdout);
  const scores = computeAccuracy(scored, baselineScored);

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: series.tenantId,
    organizationId: series.organizationId,
    seriesId: series.id,
    seriesKey: series.seriesKey,
    seriesVersion: series.version,
    modelId: model.id,
    modelKey: model.modelKey,
    modelVersion: model.version,
    method: model.method,
    parameters: projection.parameters,
    holdoutSize: horizon,
    trainingCount: split.train.length,
    firstHoldoutPeriod: first.period,
    lastHoldoutPeriod: last.period,
    scored,
    scores,
    baselineMeanAbsoluteError: meanAbsoluteError(baselineScored),
    publishable: isPublishable(scores),
    ranByUserId: params.ranByUserId ?? null,
    ranAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

// --- Guards ----------------------------------------------------------------------

/**
 * Refuse to publish a model that has not earned it.
 *
 * Named for what it asserts rather than for what it inspects, because the caller is a publication service and
 * the thing it needs to know is whether the model may go out. The evidence is frozen on the backtest, so this
 * cannot pass on a score that has since been recomputed more favourably.
 */
export function requireEarnedPublication(backtest: Backtest): Backtest {
  if (!backtest.publishable) {
    throw new ModelNotPublishableError(
      backtest.modelKey,
      backtest.scores.skillScore,
      backtest.scores.calibration,
    );
  }
  return backtest;
}

// --- Internals -------------------------------------------------------------------

/**
 * The largest holdout this series can honestly afford, or `0` where it can afford none.
 *
 * Two bounds, taken in sequence. {@link maxHoldoutSize} answers "can this series be split at all" against its
 * full length; the walk downward from there answers the question that bound cannot — whether the horizon the
 * split implies is one the *training* prefix could have supported. The condition tightens monotonically as the
 * holdout grows, so the first size that satisfies it is the largest that does, and no search is needed beyond a
 * descent.
 *
 * Returning `0` is only reachable when {@link maxHoldoutSize} already returned `0`: a series long enough to
 * afford one held-back period always has enough training history behind it to forecast one period ahead. That
 * coincidence is what keeps {@link HoldoutTooSmallError}'s message about observation count literally true.
 */
const affordableHoldout = (observationCount: number): number => {
  for (let size = maxHoldoutSize(observationCount); size >= 1; size -= 1) {
    if (isHorizonAdmissible(size, observationCount - size)) return size;
  }
  return 0;
};

/**
 * The holdout this backtest will actually use.
 *
 * Defaults to the largest affordable split, because more scored periods is a better measurement and the caller
 * who did not choose has no opinion to honour. A request is clamped into `[1, affordable]` — never to zero,
 * which would produce a backtest that measured nothing while reporting itself as complete.
 */
const clampHoldout = (requested: number | undefined, affordable: number): number => {
  if (requested === undefined || !Number.isInteger(requested)) return affordable;
  return Math.min(affordable, Math.max(1, requested));
};

// --- Reading ---------------------------------------------------------------------

/** Whether the model did better than assuming next period looks like this one. */
export const beatsBaseline = (backtest: Backtest): boolean => backtest.scores.skillScore > 0;

/**
 * Whether the intervals told the truth about themselves.
 *
 * Underconfidence passes. Intervals wider than they needed to be are a cost the institution pays in vagueness,
 * not a claim it was misled by, and conflating the two would refuse publication to the safest models on offer.
 */
export const intervalsAreHonest = (backtest: Backtest): boolean =>
  backtest.scores.calibration !== "overconfident";

/** The periods a score was actually computed on — a gap in the holdout leaves one out, and it is absent here. */
export const scoredPeriods = (backtest: Backtest): readonly number[] =>
  backtest.scored.map((point) => point.period);

/**
 * How many held-back periods produced no score.
 *
 * Nonzero means the holdout had gaps in it. The scores are still valid over what they measured — the sample size
 * says how much that was — but a backtest that held back six periods and scored two is weaker evidence than its
 * `holdoutSize` alone suggests, and this is the number that says so.
 */
export const unscoredHoldoutSize = (backtest: Backtest): number =>
  backtest.holdoutSize - backtest.scores.sampleSize;
