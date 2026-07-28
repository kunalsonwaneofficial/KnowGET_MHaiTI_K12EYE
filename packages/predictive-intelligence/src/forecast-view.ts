import type {
  AssumptionBasis,
  AssumptionIssueCode,
  AssumptionKind,
  CalibrationVerdict,
  ConfidenceLevel,
  ForecastMethod,
  LeverKind,
  MetricDirection,
  PeriodGrain,
  TrackingState,
  UncertaintyGrade,
  UncertaintyReason,
} from "./forecast-value";

/**
 * Narrow read views the eight pure engines operate over — series, projection, uncertainty, assumptions,
 * reproducibility, accuracy, simulation and planning. Each is the least an engine needs and never the whole
 * aggregate, so every engine is written and tested before any aggregate, repository or controller exists to
 * depend on it, exactly as the platform's pure-engine-first discipline requires.
 *
 * Two absences shape everything below.
 *
 * There is **no clock**. A period is an integer index on a declared grid, not a date, and where calendar
 * meaning is genuinely needed — the label a human reads, the moment an observation was recorded — it is carried
 * as data that the engines never compare against "now". A forecast that changes because a test ran after
 * midnight is not reproducible, and the cheapest way to be sure of that is to have nothing to ask.
 *
 * There is **no random source**. Every projection, interval, simulation and score below is closed-form
 * arithmetic over the pinned inputs. Where a real forecasting stack would sample, this contract computes, and
 * the reason is the fourth rule: a result that depends on a draw is reproducible only if the draw is pinned
 * too, and pinning a seed is a promise about an implementation rather than about the arithmetic. Simulation
 * here means "apply these declared levers to this pinned baseline", not "run this ten thousand times".
 */

// --- The observation series ------------------------------------------------------

/**
 * One observed value at one period on the series' grid.
 *
 * `period` is an integer index into the series' own grid, not a date. The grid's origin is declared once on the
 * series and every observation, projection and interval afterwards is an offset from it, which is what makes
 * gap detection, seasonal position and horizon arithmetic exact at every grain — including `term`, which no
 * date arithmetic handles without inventing a convention.
 *
 * `label` is the human-readable period name (`2026-03`, `Term 2 2026`) carried along for display and never
 * parsed, compared or ordered by any engine. It exists so a reader of a forecast knows what period 41 was.
 */
export interface Observation {
  readonly period: number;
  readonly value: number;
  readonly label: string;
}

/**
 * A series as the engines see it: the grid it is on, the ordered observations upon it, and — if the institution
 * declared one — the length of its seasonal cycle.
 *
 * `cycleLength` is `null` unless someone declared it. It is never inferred from the grain, because a default is
 * a guess and a guessed season produces a seasonal forecast that is confidently, specifically wrong. The grain's
 * conventional cycle is offered at declaration time and that is the whole of its role.
 */
export interface SeriesView {
  readonly seriesKey: string;
  readonly grain: PeriodGrain;
  readonly direction: MetricDirection;
  readonly cycleLength: number | null;
  readonly observations: readonly Observation[];
}

/** Stable codes for what is wrong with a series, from {@link inspectSeries}. */
export const SERIES_ISSUE_CODES = [
  "no_observations",
  "below_observation_floor",
  "duplicate_period",
  "unordered_periods",
  "non_finite_value",
  "has_gaps",
  "invalid_cycle_length",
  "seasonal_cycle_incomplete",
] as const;
export type SeriesIssueCode = (typeof SERIES_ISSUE_CODES)[number];

/**
 * What the series engine found. `forecastable` is the gate every other engine stands behind: it is false when
 * the series cannot support any forecast at all, and it is deliberately *not* the same as `issues.length === 0`
 * — a gap is a real issue that widens the interval and belongs on the record, but a series with one missing
 * month is still worth forecasting from, and refusing would push the institution back to the spreadsheet it
 * came from.
 *
 * `contiguousSpan` is the count of periods from first to last inclusive, so `contiguousSpan - count` is exactly
 * the number of missing periods; `gapPeriods` names them, because "which months are missing" is the question a
 * data steward actually asks and recomputing it from a count is work the caller should not have to do.
 */
export interface SeriesInspection {
  readonly seriesKey: string;
  readonly count: number;
  readonly firstPeriod: number | null;
  readonly lastPeriod: number | null;
  readonly contiguousSpan: number;
  readonly gapPeriods: readonly number[];
  readonly completeCycles: number;
  readonly forecastable: boolean;
  readonly issues: readonly SeriesIssueCode[];
}

/**
 * Summary statistics over a series' values. Computed once by the series engine and passed to whoever needs
 * them, so the projection, uncertainty and simulation engines never each re-derive a mean from the same array
 * and never disagree about it by a floating-point hair.
 *
 * `meanAbsoluteChange` is the average absolute period-to-period movement — the plainest available measure of
 * how much this metric actually moves, and the fallback the uncertainty engine leans on when there are too few
 * residuals to estimate a spread from.
 */
export interface SeriesStatistics {
  readonly count: number;
  readonly mean: number;
  readonly min: number;
  readonly max: number;
  readonly standardDeviation: number;
  readonly meanAbsoluteChange: number;
}

/**
 * A train/holdout split for backtesting: the earliest observations to fit from and the latest to score against.
 *
 * The split is always chronological and never random. Scoring a forecast against periods that sat *inside* the
 * data it was derived from measures memory rather than prediction, and a shuffled split does exactly that while
 * looking rigorous — which is why the shape of this type does not permit one.
 */
export interface HoldoutSplit {
  readonly train: readonly Observation[];
  readonly holdout: readonly Observation[];
}

// --- Projection ------------------------------------------------------------------

/**
 * The parameters a projection method may read. All optional, all with documented defaults in the projection
 * engine, and all pinned onto the run that used them — a parameter that is not on the record is a parameter
 * that cannot be reproduced.
 */
export interface ProjectionParameters {
  /** Window size for `moving_average`. Defaults to the smaller of 3 and the observation count. */
  readonly windowSize?: number;
  /** Level smoothing factor for `exponential_smoothing`, in (0, 1]. Defaults to 0.3. */
  readonly alpha?: number;
}

/**
 * One projected period, before any interval is attached.
 *
 * The separation is the point. Producing a point and stating its uncertainty are two different judgements made
 * by two different engines from two different inputs, and a type that fused them would let a method quietly
 * assert its own confidence. Here a bare {@link ProjectionPoint} is an intermediate value that no aggregate can
 * store and no API can return — the only thing this package will hand out is a {@link ForecastPoint}.
 */
export interface ProjectionPoint {
  readonly period: number;
  readonly horizon: number;
  readonly value: number;
}

/**
 * Projection parameters after defaults have been applied and clamped to what the series can support. This — not
 * the caller's partial request — is the form pinned onto a run, because a default that was resolved at
 * computation time is a real input to the arithmetic and an unrecorded input is an unreproducible one.
 */
export interface ResolvedProjectionParameters {
  readonly windowSize: number;
  readonly alpha: number;
}

/**
 * One in-sample fitted value: what the method would have said about a period it can already see, beside what
 * that period actually was.
 *
 * These are the whole basis of every prediction interval in this package. A method that fits its own history
 * badly has no business claiming a narrow future, and residuals are the only measurement of that which does not
 * require believing anything about the shape of the world.
 */
export interface FittedPoint {
  readonly period: number;
  readonly actual: number;
  readonly fitted: number;
  readonly residual: number;
}

/**
 * Everything one projection produced: the future points, the in-sample fit those points' uncertainty will be
 * derived from, and the parameters as actually resolved.
 *
 * `fallbackPeriods` names the future periods where the declared method had nothing to read — a seasonal method
 * whose corresponding period one cycle back is missing — and the last observed value stood in. It is reported
 * rather than smoothed over because a "seasonal forecast" that quietly degraded to a flat line for four of its
 * six periods is not the forecast anyone thinks they are reading.
 */
export interface ProjectionResult {
  readonly method: ForecastMethod;
  readonly parameters: ResolvedProjectionParameters;
  readonly points: readonly ProjectionPoint[];
  readonly fitted: readonly FittedPoint[];
  readonly fallbackPeriods: readonly number[];
}

/**
 * A prediction interval at one confidence level. `level` is one of the three admissible levels, and `lower` is
 * always at or below `upper` by construction.
 */
export interface PredictionInterval {
  readonly level: ConfidenceLevel;
  readonly lower: number;
  readonly upper: number;
}

/**
 * **A forecast, as this package is willing to state one.** A point value, and the intervals around it — plural,
 * ordered by level, and guaranteed by the uncertainty engine to include {@link REQUIRED_CONFIDENCE_LEVEL}.
 *
 * There is no constructor here that yields a `ForecastPoint` without intervals, and that is the contract's
 * first rule expressed as a type rather than as a validation someone can skip. `intervalWidth` is the width of
 * the required interval, hoisted out because it is what every downstream comparison — is this forecast tighter
 * than that one, has uncertainty grown with horizon — actually reads.
 */
export interface ForecastPoint {
  readonly period: number;
  readonly horizon: number;
  readonly label: string;
  readonly value: number;
  readonly intervals: readonly PredictionInterval[];
  readonly intervalWidth: number;
}

// --- Uncertainty -----------------------------------------------------------------

/**
 * The spread of the in-sample residuals a method left behind — how wrong it was on the history it already had.
 *
 * This is the honest basis for every interval in this package. An interval derived from an assumed distribution
 * says how wrong the method *would* be if the world matched the assumption; an interval derived from residuals
 * says how wrong this method has actually been on this series. When those disagree the second one is right, and
 * an institution that has been told the first has been told something it cannot check.
 *
 * `sampleSize` travels with the statistics because a spread computed from three residuals and one computed from
 * three hundred are not the same kind of number, and the uncertainty grade needs to know which it has.
 */
export interface ResidualStatistics {
  readonly sampleSize: number;
  readonly meanAbsoluteError: number;
  readonly rootMeanSquaredError: number;
  readonly standardDeviation: number;
}

/**
 * Everything the uncertainty engine needs to grade a forecast it did not itself produce.
 *
 * It is assembled from three separate engines' outputs — the series inspection, the series statistics and the
 * projection's residuals — rather than recomputed here, so a grade is always about the same numbers the caller
 * is holding. An engine that re-derived its own view of the history could grade a forecast that no longer
 * exists, and the disagreement would surface as an unreproducible interval months later.
 */
export interface UncertaintyInput {
  readonly method: ForecastMethod;
  readonly inspection: SeriesInspection;
  readonly statistics: SeriesStatistics;
  readonly residuals: ResidualStatistics;
  readonly horizon: number;
  readonly points: readonly ForecastPoint[];
}

/**
 * The engine's verdict on how much the intervals it just produced are worth, with the reasons that produced it.
 *
 * `reasons` are stable codes, sorted and de-duplicated, and they are the useful half: `wide` on its own tells an
 * operator nothing they can act on, while `wide` because of `short_history` and `wide` because of
 * `volatile_history` call for opposite responses — wait and collect, versus stop expecting this metric to be
 * predictable at all.
 *
 * `relativeWidth` is the required interval's width as a fraction of the projected level, the scale-free measure
 * that lets a rupee figure and a percentage be compared at all. It is `null` where the projected value is zero,
 * because a ratio to zero is not a large number, it is not a number.
 */
export interface UncertaintyAssessment {
  readonly grade: UncertaintyGrade;
  readonly reasons: readonly UncertaintyReason[];
  readonly residuals: ResidualStatistics;
  readonly relativeWidth: number | null;
  readonly maxHorizon: number;
}

// --- Assumptions -----------------------------------------------------------------

/**
 * A declared assumption as the assumption engine sees it.
 *
 * `holderId` and `reference` are the answerability half of the contract's rule. Which one is required depends on
 * the basis: `expert_judgement` must name a person, `declared_policy` and `upstream_forecast` must name the
 * record they lean on. The engine reports the omission rather than the aggregate silently accepting it, so an
 * assumption is never on the platform without its grounds.
 */
export interface AssumptionView {
  readonly assumptionKey: string;
  readonly kind: AssumptionKind;
  readonly basis: AssumptionBasis;
  readonly holderId: string | null;
  readonly reference: string | null;
  /** Where this assumption expects a quantity to sit, when it makes a quantitative claim at all. */
  readonly expectedValue: number | null;
}

/** One thing wrong with a declared assumption set, and which assumption it is wrong about. */
export interface AssumptionIssue {
  readonly code: AssumptionIssueCode;
  /** The assumption at fault, or `null` for set-level issues (`no_assumptions`). */
  readonly assumptionKey: string | null;
}

/**
 * What the assumption engine found across a whole declared set.
 *
 * `complete` is the gate a run must pass: no assumptions at all is the commonest and most consequential failure,
 * because a forecast published without them reads as if it depends on nothing. `unstated_assumption` is the
 * subtler one — a method that consumes a seasonal cycle while the set says nothing about seasonality is relying
 * on a belief nobody wrote down, and the engine names it rather than letting the method's own configuration
 * stand in for a declaration.
 */
export interface AssumptionInspection {
  readonly count: number;
  readonly complete: boolean;
  readonly issues: readonly AssumptionIssue[];
}

// --- Reproducibility -------------------------------------------------------------

/**
 * Everything that determined a result, in the exact form it will be digested.
 *
 * If two runs share this, they must produce identical numbers; if their numbers differ, something outside this
 * record moved, and that is a defect in the platform rather than a fact about the forecast. The type is
 * therefore closed and small on purpose: every field here is one the arithmetic actually reads, and nothing
 * here is a timestamp, an actor or a request id — provenance that does not change the answer belongs on the
 * run, not in its digest, or every re-run would report drift.
 */
export interface ReproducibilityInputs {
  readonly seriesKey: string;
  /** The series' monotonic version at the moment it was pinned. */
  readonly seriesVersion: number;
  readonly modelKey: string;
  /** The model's monotonic version. A published model is frozen, so this pins the method and its parameters. */
  readonly modelVersion: number;
  readonly method: ForecastMethod;
  readonly parameters: ProjectionParameters;
  readonly horizon: number;
  readonly confidenceLevels: readonly ConfidenceLevel[];
  /** Sorted assumption keys. A run under different assumptions is a different run even at identical numbers. */
  readonly assumptionKeys: readonly string[];
}

/**
 * The pinned identity of a run: a stable digest over {@link ReproducibilityInputs} plus the canonical string it
 * was computed from.
 *
 * The canonical form is kept alongside the digest deliberately. A digest that disagrees is a mystery; a digest
 * that disagrees next to the two strings that produced it is a five-second diff, and the moment somebody most
 * needs that diff is the moment a regulator is asking why a published forecast no longer reproduces.
 */
export interface ReproducibilityKey {
  readonly digest: string;
  readonly canonical: string;
}

/** Stable codes for what moved between a run and an attempt to reproduce it. */
export const DRIFT_CODES = [
  "series_version_changed",
  "model_version_changed",
  "method_changed",
  "parameters_changed",
  "horizon_changed",
  "confidence_levels_changed",
  "assumptions_changed",
  "values_changed",
] as const;
export type DriftCode = (typeof DRIFT_CODES)[number];

/**
 * The verdict of recomputing a run and comparing it with what was recorded.
 *
 * `reproducible` requires both that the inputs still digest identically and that the recomputed values match to
 * {@link FORECAST_PRECISION}. Splitting the reasons matters: inputs that moved is an expected, explainable
 * event — a series got a late correction — while identical inputs producing different numbers is a platform
 * defect, and `values_changed` appearing without any other code is precisely that alarm.
 */
export interface ReproductionResult {
  readonly reproducible: boolean;
  readonly recordedDigest: string;
  readonly recomputedDigest: string;
  readonly drift: readonly DriftCode[];
  /** Largest absolute difference between a recorded and a recomputed point value. Zero when they match. */
  readonly maxValueDelta: number;
}

// --- Accuracy --------------------------------------------------------------------

/** One forecast point set beside what actually happened, the atom every accuracy score is computed from. */
export interface ScoredPoint {
  readonly period: number;
  readonly horizon: number;
  readonly forecast: number;
  readonly actual: number;
  readonly intervals: readonly PredictionInterval[];
}

/**
 * How well a model actually forecast, on periods it did not see.
 *
 * `meanAbsolutePercentageError` is `null` when any actual is zero rather than infinite or skipped, because a
 * percentage error against zero is undefined and both alternatives lie: infinity poisons an average, and
 * quietly dropping the point reports a score computed over a different set than the one named.
 *
 * `skillScore` is the ratio of this method's error to the naive baseline's, subtracted from one: positive means
 * it beat "next period looks like this one", zero means it matched it, negative means the institution would
 * have done better with no model at all. It is the only score here that answers "was this worth doing", which
 * is the only question that matters when deciding whether to publish a model.
 *
 * `intervalCoverage` is the fraction of actuals that fell inside the required interval, and it is what turns
 * the contract's first rule from a formality into a check: an 80% interval that catches 40% of outcomes has
 * been stating a confidence it never had.
 */
export interface AccuracyScores {
  readonly sampleSize: number;
  readonly meanAbsoluteError: number;
  readonly rootMeanSquaredError: number;
  readonly meanAbsolutePercentageError: number | null;
  readonly skillScore: number;
  readonly intervalCoverage: number;
  readonly coverageLevel: ConfidenceLevel;
  readonly calibration: CalibrationVerdict;
}

// --- Simulation ------------------------------------------------------------------

/**
 * One scenario lever: a declared, deterministic movement applied to a baseline projection from a given horizon
 * onward.
 *
 * `fromHorizon` is what makes a scenario a scenario rather than a re-forecast. "Fees rise 4% from the second
 * term" is a different claim from "fees are 4% higher throughout", and a lever that could only apply to the
 * whole projection would force every what-if into the second shape.
 *
 * `assumptionKey` binds the lever to the assumption it varies. It is nullable because a lever may explore
 * something nobody assumed, but when it is present the simulation engine reports the pairing, so a scenario is
 * traceable to the belief it is testing instead of being an unexplained set of numbers.
 */
export interface LeverView {
  readonly leverKey: string;
  readonly kind: LeverKind;
  readonly magnitude: number;
  readonly fromHorizon: number;
  readonly assumptionKey: string | null;
}

/**
 * One period of a simulation: the baseline, the scenario value, and the movement between them.
 *
 * The baseline is carried on every point rather than referenced, because a scenario read without its baseline
 * is a number with no meaning, and the commonest way that happens is a UI or an export that had the two in
 * separate arrays and lost one.
 */
export interface SimulationPoint {
  readonly period: number;
  readonly horizon: number;
  readonly label: string;
  readonly baselineValue: number;
  readonly scenarioValue: number;
  readonly delta: number;
  /** Movement as a fraction of the baseline. `null` where the baseline is zero. */
  readonly relativeDelta: number | null;
  readonly appliedLeverKeys: readonly string[];
}

/**
 * The result of simulating one scenario against one pinned baseline forecast.
 *
 * `inheritedUncertainty` is the baseline's grade, carried forward unchanged and never improved. A scenario
 * cannot be more certain than the forecast it moves — it is that forecast plus a set of assumed movements — and
 * the failure mode this prevents is real and seductive: a clean-looking what-if built on a forecast graded
 * `unusable`, presented to a board as though the levers had somehow settled the underlying question.
 *
 * `overridden` says an `override` lever discarded the projection for at least one period, reported distinctly
 * because those periods no longer depend on the model at all and a reader deserves to know which ones.
 */
export interface SimulationOutcome {
  readonly scenarioKey: string;
  readonly points: readonly SimulationPoint[];
  readonly totalBaseline: number;
  readonly totalScenario: number;
  readonly totalDelta: number;
  readonly peakDelta: number;
  readonly inheritedUncertainty: UncertaintyGrade;
  readonly overridden: boolean;
  readonly unappliedLeverKeys: readonly string[];
}

// --- Strategic planning ----------------------------------------------------------

/**
 * A plan objective as the planning engine sees it: what is being aimed at, by when, from where.
 *
 * `direction` is what makes a variance interpretable — below target is success for chronic absence and failure
 * for collection — and it is carried on the objective rather than looked up, so the engine stays pure and a
 * plan's objectives are readable without the metric registry to hand.
 */
export interface ObjectiveView {
  readonly objectiveKey: string;
  readonly metricKey: string;
  readonly direction: MetricDirection;
  readonly baselineValue: number;
  readonly targetValue: number;
  readonly targetPeriod: number;
}

/** An objective's actual position at a period, as recorded by a plan review. */
export interface ObjectiveProgressView {
  readonly objectiveKey: string;
  readonly period: number;
  readonly actualValue: number;
}

/**
 * Where an objective stands: against the straight line from baseline to target, and against the target itself.
 *
 * `expectedValue` is linear interpolation between baseline and target, and the choice is deliberate. A plan
 * whose expected trajectory bends is a plan whose progress can be redefined mid-flight, and the straight line —
 * crude, transparent, arguable by anyone — is the only trajectory an institution cannot be talked out of
 * halfway through.
 *
 * `progressRatio` is the fraction of the baseline-to-target distance covered, direction-normalized so that
 * positive always means progress whichever way the metric is supposed to move. It is `null` when baseline and
 * target coincide, because an objective that asks for no movement has no progress to report.
 */
export interface ObjectiveVariance {
  readonly objectiveKey: string;
  readonly period: number;
  readonly expectedValue: number;
  readonly actualValue: number;
  readonly variance: number;
  readonly progressRatio: number | null;
  readonly state: TrackingState;
}

/**
 * A plan's overall position, aggregated from its objectives.
 *
 * `state` is the worst state across objectives rather than an average of them, and that is the whole of the
 * design. A plan with nine objectives on track and one off track is a plan with a problem, and an aggregate
 * that reports it as 90% healthy is precisely the instrument that lets an institution walk into a failure it
 * had every piece of information to see coming.
 */
export interface PlanVariance {
  readonly planKey: string;
  readonly period: number;
  readonly objectives: readonly ObjectiveVariance[];
  readonly onTrackCount: number;
  readonly atRiskCount: number;
  readonly offTrackCount: number;
  readonly achievedCount: number;
  readonly missedCount: number;
  readonly state: TrackingState;
}
