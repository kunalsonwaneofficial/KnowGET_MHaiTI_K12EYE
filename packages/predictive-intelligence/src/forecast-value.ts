/**
 * Value objects for Predictive Intelligence, Simulation & Strategic Planning (P2-D28). These are the vocabulary
 * of the forecasting layer: what may be measured, over what grid, by what method, with what stated uncertainty,
 * under what declared assumptions, and how a result is pinned so it can be recomputed. They are TEXT in the
 * store and closed unions here — the grammar of a forecast is fixed even though the *catalog* (metric keys,
 * series keys, model keys, scenario keys) is extensible, because every one of the twenty-four operational
 * domains deferred its own prediction to this contract and each will bring metrics nobody has named yet.
 *
 * The contract's rule is single and total: **every forecast must carry confidence intervals, declare its
 * assumptions, express its uncertainty, and be reproducible and versioned.** Four declarations here are that
 * rule made structural, and each is deliberately narrow:
 *
 * - {@link REQUIRED_CONFIDENCE_LEVEL} is `80`, and {@link CONFIDENCE_LEVELS} is a closed three-member set. A
 *   forecast point without at least the required interval cannot be constructed — not "is rejected in review",
 *   cannot be constructed. A bare number is not a weaker forecast; it is a different and inadmissible kind of
 *   claim.
 * - {@link MAX_HORIZON_RATIO} is `0.5` and it is a single constant rather than a per-tenant setting, because
 *   "you may not forecast further than half of what you have observed" is an honesty property of the platform
 *   and not a preference of an institution. Nothing in this package can raise it. The classic abuse of a
 *   forecasting system is a five-year projection from six months of history, and the only reliable defence is
 *   arithmetic that refuses rather than a reviewer who notices.
 * - {@link ASSUMPTION_BASES} has four members and every one of them is answerable — observed history, a
 *   declared policy, a named person's judgement, or an upstream forecast that is itself on the record. There is
 *   no vocabulary here for an unattributed belief, so an assumption cannot be declared without saying who or
 *   what stands behind it.
 * - {@link FORECAST_PRECISION} fixes the decimal place at which every derived value is rounded. That is what
 *   makes reproduction *checkable* rather than merely intended: two runs of the same method over the same
 *   inputs must agree exactly, and floating-point noise a dozen places down would otherwise report drift where
 *   there is none — and, far worse, teach an operator that the drift alarm is usually wrong.
 *
 * There is no vocabulary here for a model artefact, a weight, a training job, an embedding or a provider. The
 * methods in this contract are closed-form and arithmetic, and a projection is a function of the pinned series
 * and the declared parameters — nothing else. Statistical or learned models that require fitting infrastructure
 * are a later concern, and the boundary is held here, in the absence of the words for them.
 */

// --- Keys ------------------------------------------------------------------------

/**
 * The canonical form of a registry key: trimmed and lower-cased. Metric keys, series keys, model keys, scenario
 * keys, lever keys, assumption keys, objective keys and plan keys all share one grammar, because a scenario's
 * lever is matched to an assumption by exact string and a match that fails on a stray capital would silently
 * apply nothing — a what-if that quietly changed nothing is worse than one that failed.
 */
const normalizeKey = (key: string): string => key.trim().toLowerCase();

/** Normalize a metric key — what is being measured (`attendance.chronic_absence_rate`). */
export const normalizeMetricKey = (key: string): string => normalizeKey(key);

/** Normalize an observation series key — one metric, one subject, one grain. */
export const normalizeSeriesKey = (key: string): string => normalizeKey(key);

/** Normalize a forecast model key — the versioned method definition. */
export const normalizeModelKey = (key: string): string => normalizeKey(key);

/** Normalize a scenario key. */
export const normalizeScenarioKey = (key: string): string => normalizeKey(key);

/** Normalize a scenario lever key — matched against an assumption key by exact string. */
export const normalizeLeverKey = (key: string): string => normalizeKey(key);

/** Normalize a declared assumption key. */
export const normalizeAssumptionKey = (key: string): string => normalizeKey(key);

/** Normalize a strategic plan key. */
export const normalizePlanKey = (key: string): string => normalizeKey(key);

/** Normalize a plan objective key — unique within one plan. */
export const normalizeObjectiveKey = (key: string): string => normalizeKey(key);

/**
 * Normalize a source-domain name (`attendance`, `fees`, `admissions`, `workforce`). A series' subject is an
 * opaque reference into an operational domain, exactly as the knowledge graph's is: this domain never re-models
 * the record it is forecasting about, and never recomputes the indicator the owning domain already publishes.
 */
export const normalizeSourceDomain = (domain: string): string => normalizeKey(domain);

// --- Numeric discipline ----------------------------------------------------------

/**
 * The decimal place at which every derived value in this package is rounded — projections, interval bounds,
 * residual statistics, accuracy scores, simulation deltas and variances alike.
 *
 * This is not cosmetic. Reproducibility is checked by recomputing a run and comparing, and IEEE-754 arithmetic
 * over a re-read series can differ in the last representable bit for reasons that have nothing to do with the
 * forecast having changed. Rounding every derived value to a fixed place before it is stored or digested makes
 * "identical" mean identical, so a drift report is always a real drift. Six places is far below the resolution
 * of any institutional metric and far above the noise floor of the arithmetic here.
 */
export const FORECAST_PRECISION = 6;

/**
 * Round to {@link FORECAST_PRECISION}, resolving the halfway case away from zero and normalizing negative zero.
 *
 * The negative-zero clause matters more than it looks: `-0` and `0` compare equal with `===` but serialize
 * differently, so a digest over an unnormalized `-0` would report drift between two runs that agree perfectly.
 */
export const roundValue = (value: number): number => {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** FORECAST_PRECISION;
  const scaled = value * factor;
  const rounded = scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
  const result = rounded / factor;
  return result === 0 ? 0 : result;
};

/** Whether a value is admissible as an observation or a projection: finite, and not `NaN`. */
export const isFiniteValue = (value: number): boolean => Number.isFinite(value);

// --- Metrics and the period grid -------------------------------------------------

/**
 * Which way is good. Needed because a variance is meaningless without it: a chronic-absence rate below target
 * is success and a collection rate below target is failure, and no amount of arithmetic distinguishes them.
 * `neutral` exists for metrics that are counts of something the institution neither wants more nor less of.
 */
export const METRIC_DIRECTIONS = ["higher_is_better", "lower_is_better", "neutral"] as const;
export type MetricDirection = (typeof METRIC_DIRECTIONS)[number];

/**
 * The grain of the period grid. A series is observed at exactly one grain and is forecast at that same grain —
 * this package never resamples, because resampling is a modelling decision with its own assumptions and hiding
 * one inside an implicit conversion is precisely the sort of undeclared assumption the contract forbids.
 *
 * `term` is here because K–12 institutions genuinely plan on it and it is not expressible as a fixed number of
 * weeks; the engines never convert between grains, so its irregularity costs nothing.
 */
export const PERIOD_GRAINS = ["day", "week", "month", "term", "year"] as const;
export type PeriodGrain = (typeof PERIOD_GRAINS)[number];

/**
 * The number of periods in one seasonal cycle at a given grain, or `null` where a cycle is not defined.
 *
 * Seasonality is declared per series rather than inferred, and this is only the default offered to whoever
 * declares it. An institution whose attendance cycles weekly at a daily grain and whose fee collection cycles
 * annually at a monthly grain are both ordinary, and guessing would produce a confidently wrong seasonal
 * forecast — the most expensive kind.
 */
export const DEFAULT_CYCLE_LENGTH: Readonly<Record<PeriodGrain, number | null>> = {
  day: 7,
  week: 52,
  month: 12,
  term: 3,
  year: null,
};

// --- The forecast methods --------------------------------------------------------

/**
 * The projection methods this contract implements. Every one is **closed-form, deterministic and arithmetic**:
 * given the pinned observations and the declared parameters, the output is a pure function with no fitting
 * loop, no convergence criterion, no random initialization and no learned artefact.
 *
 * That is a boundary, not a limitation of effort. A method with a fitting procedure has a state nobody pinned,
 * and the contract's fourth rule — reproducible and versioned — would then depend on a training run rather than
 * on the recorded inputs. When learned models arrive they will arrive as a *different* kind of model with their
 * own artefact custody, not by quietly widening this union.
 *
 * `naive` is here not because anyone should plan on it but because it is the **skill baseline**: an accuracy
 * score means nothing in isolation, and a method that cannot beat "next period looks like this one" has not
 * earned the institution's attention.
 */
export const FORECAST_METHODS = [
  "naive",
  "drift",
  "moving_average",
  "linear_trend",
  "seasonal_naive",
  "exponential_smoothing",
] as const;
export type ForecastMethod = (typeof FORECAST_METHODS)[number];

/** The methods that consume a declared seasonal cycle and therefore need whole cycles of history. */
export const SEASONAL_METHODS: readonly ForecastMethod[] = ["seasonal_naive"];

/** Whether a method reads the series' seasonal cycle. */
export const isSeasonalMethod = (method: ForecastMethod): boolean =>
  SEASONAL_METHODS.includes(method);

// --- The floors and the ceiling --------------------------------------------------

/**
 * The fewest observations from which any forecast may be produced. Below this the residual spread that every
 * prediction interval is built from is not an estimate of anything — an interval computed from one or two
 * residuals is a number with the shape of rigour and none of its content, which is worse than no interval at
 * all because it survives being looked at.
 */
export const MIN_OBSERVATIONS_FOR_FORECAST = 4;

/** Whole seasonal cycles required before a seasonal method may be used. One cycle is a coincidence. */
export const MIN_CYCLES_FOR_SEASONAL = 2;

/**
 * **The contract rule, as a constant.** No forecast may reach further ahead than this fraction of the history
 * behind it: twelve observed months buys six forecast months and not a thirteenth.
 *
 * It is `0.5`, it is not configurable, and no model parameter, tenant setting or scenario in this package can
 * raise it. Every other guard here can be argued with — a seasonal cycle can be declared differently, a method
 * can be swapped, an assumption can be restated — but the relationship between how much you have seen and how
 * far you may claim to see is the one thing a forecasting system must not let its users negotiate, because the
 * pressure to negotiate it is exactly proportional to how badly the answer is wanted.
 */
export const MAX_HORIZON_RATIO = 0.5;

/** The furthest horizon admissible from a given number of observations. Zero below the observation floor. */
export const maxHorizonFor = (observationCount: number): number =>
  observationCount < MIN_OBSERVATIONS_FOR_FORECAST
    ? 0
    : Math.floor(observationCount * MAX_HORIZON_RATIO);

/** Whether a horizon is admissible from a given number of observations. The whole of the ratio rule. */
export const isHorizonAdmissible = (horizon: number, observationCount: number): boolean =>
  Number.isInteger(horizon) && horizon >= 1 && horizon <= maxHorizonFor(observationCount);

// --- Confidence and uncertainty --------------------------------------------------

/**
 * The confidence levels a prediction interval may be stated at. Closed on purpose: an arbitrary level invites
 * the level to be chosen after the interval is seen, and a 60% interval quoted because the 80% one looked
 * alarming is a lie told in the vocabulary of statistics.
 */
export const CONFIDENCE_LEVELS = [50, 80, 95] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

/**
 * **The contract rule, as a constant.** Every forecast point must carry at least this interval. A point that
 * cannot state where the outcome is likely to fall is not a weaker forecast — it is a different claim, and this
 * package has no way to represent it.
 */
export const REQUIRED_CONFIDENCE_LEVEL: ConfidenceLevel = 80;

/**
 * Normal-quantile multipliers for the admissible levels, to four places.
 *
 * They are a table rather than a computed inverse-normal because the table is exact at the three points that
 * exist, is auditable by anyone with a reference to hand, and cannot drift between runs — and reproducibility
 * is worth more here than a generality this contract has closed off anyway.
 */
export const CONFIDENCE_MULTIPLIERS: Readonly<Record<ConfidenceLevel, number>> = {
  50: 0.6745,
  80: 1.2816,
  95: 1.96,
};

/**
 * How much the interval is worth trusting, tightest first. This is the "express uncertainty" half of the rule
 * as a *verdict* rather than a number: an interval is a width, and a width means nothing to a reader who does
 * not know whether the history under it was long enough, regular enough or stable enough to justify it.
 *
 * `unusable` is a real outcome, not a floor. A forecast can be arithmetically correct and still be something no
 * institution should plan on, and the platform saying so plainly is more useful than a number that quietly is.
 */
export const UNCERTAINTY_GRADES = ["tight", "moderate", "wide", "unusable"] as const;
export type UncertaintyGrade = (typeof UNCERTAINTY_GRADES)[number];

/** The rank of an uncertainty grade (0 = tight). Used to compare and to take the worse of two. */
export const uncertaintyRank = (grade: UncertaintyGrade): number =>
  UNCERTAINTY_GRADES.indexOf(grade);

/** The worse (wider) of two uncertainty grades. */
export const worseUncertainty = (a: UncertaintyGrade, b: UncertaintyGrade): UncertaintyGrade =>
  uncertaintyRank(a) >= uncertaintyRank(b) ? a : b;

/**
 * Stable reason codes explaining why a forecast's uncertainty was graded as it was. They travel on events and
 * into the API, so an operator reading "wide" is never left to guess which of several very different problems
 * produced it — a short history, a gappy one, a volatile one and an over-reached horizon call for four
 * different responses, and only one of them is "collect more data".
 */
export const UNCERTAINTY_REASONS = [
  "short_history",
  "sparse_history",
  "volatile_history",
  "long_horizon",
  "unstable_residuals",
  "seasonal_cycle_incomplete",
] as const;
export type UncertaintyReason = (typeof UNCERTAINTY_REASONS)[number];

// --- Assumptions -----------------------------------------------------------------

/**
 * What kind of thing an assumption is about. The kinds are the recurring shapes of "this forecast holds only
 * if…" in an institution: that the past keeps applying, that something outside the model stays put, that a
 * policy holds, that capacity is what it is, that the data means what it says, and that the season repeats.
 */
export const ASSUMPTION_KINDS = [
  "continuity",
  "exogenous",
  "policy",
  "capacity",
  "data_quality",
  "seasonality",
] as const;
export type AssumptionKind = (typeof ASSUMPTION_KINDS)[number];

/**
 * What stands behind an assumption. Every member is answerable to someone or something: history that was
 * observed, a policy that was declared, a person who will put their name to a judgement, or an upstream
 * forecast that is itself on this record with its own interval and its own assumptions.
 *
 * There is deliberately no member for an unattributed belief. "We expect enrolment to hold" is not an
 * assumption this package can store, and that refusal is the whole of the second half of the contract's rule:
 * declaring assumptions is only worth something if a declaration has to name its own grounds.
 */
export const ASSUMPTION_BASES = [
  "observed_history",
  "declared_policy",
  "expert_judgement",
  "upstream_forecast",
] as const;
export type AssumptionBasis = (typeof ASSUMPTION_BASES)[number];

/** The bases that must name a person. `expert_judgement` is a person's judgement or it is nobody's. */
export const BASES_REQUIRING_HOLDER: readonly AssumptionBasis[] = ["expert_judgement"];

/** The bases that must name the upstream record they lean on. */
export const BASES_REQUIRING_REFERENCE: readonly AssumptionBasis[] = [
  "declared_policy",
  "upstream_forecast",
];

/** Stable issue codes from inspecting a declared assumption set. */
export const ASSUMPTION_ISSUE_CODES = [
  "no_assumptions",
  "duplicate_assumption_key",
  "missing_holder",
  "missing_reference",
  "unstated_assumption",
  "contradictory_assumptions",
] as const;
export type AssumptionIssueCode = (typeof ASSUMPTION_ISSUE_CODES)[number];

// --- Scenario levers -------------------------------------------------------------

/**
 * How a scenario lever moves a baseline. Four shapes, all deterministic and all invertible on paper, so a
 * reader can check what a scenario did to a number without running anything.
 *
 * `override` is the blunt one and is kept because institutions genuinely do plan against a fixed figure
 * ("assume the grant is exactly this"), but it is the lever that discards the projection entirely, so the
 * simulation engine reports it distinctly rather than folding it in with the others.
 */
export const LEVER_KINDS = ["additive", "multiplicative", "override", "growth_rate"] as const;
export type LeverKind = (typeof LEVER_KINDS)[number];

/**
 * The widest multiplicative or growth movement a single lever may apply, as a factor away from 1. A scenario is
 * a what-if, not a fantasy: at some magnitude the baseline projection has stopped informing the answer and the
 * lever *is* the answer, and a simulation that cannot tell those apart is a spreadsheet with extra steps.
 */
export const MAX_LEVER_FACTOR = 10;

/** Whether a multiplicative factor or growth multiplier is within the admissible band. */
export const isLeverFactorAdmissible = (factor: number): boolean =>
  Number.isFinite(factor) && factor > 0 && factor <= MAX_LEVER_FACTOR;

// --- Statuses --------------------------------------------------------------------

/**
 * An observation series' lifecycle. `closed` means no further observations will be appended — a series for a
 * discontinued metric or a completed academic year. A closed series can still be forecast *from*, because the
 * runs that pinned it must stay reproducible.
 */
export const SERIES_STATUSES = ["active", "closed"] as const;
export type SeriesStatus = (typeof SERIES_STATUSES)[number];

/**
 * A forecast model's lifecycle. `published` is the only status a run may pin, and a published model is frozen —
 * editing one mints a new version rather than changing what earlier runs meant. Retiring stops new runs and
 * leaves old ones intact and still readable.
 */
export const MODEL_STATUSES = ["draft", "published", "retired"] as const;
export type ModelStatus = (typeof MODEL_STATUSES)[number];

/**
 * A forecast run's lifecycle. A run is *born completed* — the computation is pure, synchronous and closed-form,
 * so there is no pending state to represent and no failure mode that leaves a half-run on the record.
 *
 * `invalidated` is the interesting one: it is what a run becomes when the series version it pinned is no longer
 * the series' current version and a check has confirmed the numbers would now differ. The run is not deleted
 * and not corrected — it stays exactly as it was, marked as no longer reproducible from today's inputs, because
 * the honest record of a forecast that has been overtaken is the forecast plus the fact that it was overtaken.
 */
export const RUN_STATUSES = ["completed", "superseded", "invalidated"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** A scenario's lifecycle. Only a `published` scenario may be simulated or carried by a plan. */
export const SCENARIO_STATUSES = ["draft", "published", "archived"] as const;
export type ScenarioStatus = (typeof SCENARIO_STATUSES)[number];

/** A simulation run's lifecycle. Like a forecast run, it is born completed and is never edited. */
export const SIMULATION_STATUSES = ["completed", "superseded"] as const;
export type SimulationStatus = (typeof SIMULATION_STATUSES)[number];

/**
 * A strategic plan's lifecycle. `active` is the committed state: a plan under which the institution is actually
 * operating and against which reviews record what really happened.
 */
export const PLAN_STATUSES = ["draft", "active", "completed", "abandoned"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/**
 * How an objective is tracking against its declared trajectory. `at_risk` is deliberately between `on_track`
 * and `off_track` rather than a synonym for the latter: an institution that only learns about a missed target
 * when it is missed has bought reporting, not planning.
 */
export const TRACKING_STATES = ["on_track", "at_risk", "off_track", "achieved", "missed"] as const;
export type TrackingState = (typeof TRACKING_STATES)[number];

/** The verdict on whether a model's stated intervals are honest. See the accuracy engine. */
export const CALIBRATION_VERDICTS = ["calibrated", "overconfident", "underconfident"] as const;
export type CalibrationVerdict = (typeof CALIBRATION_VERDICTS)[number];

/**
 * How far a backtest's observed interval coverage may sit from the level it claimed before the model is called
 * miscalibrated. Ten points either side of the stated level: an 80% interval that caught between 70% and 90% of
 * outcomes is doing its job, and one that caught 40% is telling the institution a comfortable lie.
 */
export const CALIBRATION_TOLERANCE = 10;
