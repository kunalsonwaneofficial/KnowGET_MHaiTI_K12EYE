import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { Backtest } from "./backtest";
import { beatsBaseline, intervalsAreHonest } from "./backtest";
import type {
  CalibrationVerdict,
  ConfidenceLevel,
  ForecastMethod,
  MetricDirection,
  ModelStatus,
  PeriodGrain,
  PlanStatus,
  RunStatus,
  ScenarioStatus,
  SeriesStatus,
  SimulationStatus,
  TrackingState,
  UncertaintyGrade,
  UncertaintyReason,
} from "./forecast-value";
import type { DriftCode } from "./forecast-view";
import type { ForecastModel } from "./forecast-model";
import { isModelRunnable, modelReadsCycle } from "./forecast-model";
import type { ForecastRun } from "./forecast-run";
import type { ObservationSeries } from "./observation-series";
import {
  earliestObservation,
  isSeriesForecastable,
  latestObservation,
  observationCount,
} from "./observation-series";
import type { Scenario } from "./scenario";
import {
  isScenarioSimulable,
  leverCount,
  overridesBaseline,
  variedAssumptionKeys,
} from "./scenario";
import type { SimulationRun } from "./simulation-run";
import { fullyApplied, movedPeriods, relativeTotalDelta } from "./simulation-run";
import type { PlanReview, StrategicPlan } from "./strategic-plan";
import { objectiveCount, unmeasuredObjectiveKeys } from "./strategic-plan";

/**
 * Domain events for Predictive Intelligence, Simulation & Strategic Planning (P2-D28), on the `forecast.*`
 * namespace.
 *
 * One rule decides what goes on the wire here, and it is worth stating plainly because it is not the rule a
 * reader would guess for a forecasting domain: **levels stay home, shape and verdicts travel.**
 *
 * A forecast's points are the institution's numbers — a projected balance, a projected roll, a projected
 * attendance rate — and where the series carries a `subjectRef` they are one named person's numbers wearing a
 * key instead of a name. None of them are broadcast. What travels is the shape of the answer: how far ahead it
 * reaches, which method produced it, how wide the intervals came out, whether the method ran out of history and
 * fell back, and the digest that identifies the inputs. That is enough for a subscriber to route, to compare and
 * to decide whether to go and read the run; it is not enough to reconstruct the forecast from the event stream,
 * which is the point.
 *
 * The exceptions prove the rule rather than break it. A backtest's scores travel in full, because a backtest is
 * a verdict *about a model* rather than a statement about the institution — error, skill and calibration are the
 * evidence a publication rests on, and hiding them would make the contract's accuracy gate unauditable from
 * outside. A simulation's movement travels as a **ratio**: `relativeTotalDelta` says a scenario would move the
 * baseline by nine per cent without saying nine per cent of what. A plan review travels as **counts and a
 * tracking state** — how many objectives are on track, at risk, off track, achieved or missed — never as the
 * readings behind them. A classification is a fact about the institution's position; a reading is data about
 * whoever was measured.
 *
 * Every piece of free text stays in the domain: a series' `unit` and its observation `label`s, a model's `name`
 * and `description`, a scenario's, a plan's, a review's `note`, and a plan's `abandonmentReason`. So does every
 * member of staff. `producedByUserId`, `ranByUserId`, `activatedByUserId`, `closedByUserId` and
 * `reviewedByUserId` are on the record, not on the wire — the same position P2-D27 took, and for the same
 * reason: accountability is read deliberately and within-tenant, while an event is broadcast, and broadcasting
 * who signed off what turns an operational feed into a surveillance feed. A subscriber that genuinely needs the
 * person resolves it from the id.
 *
 * Assumption keys do travel, on runs and on scenarios. That is the contract's third rule made observable: "which
 * of our forecasts rest on the fee-policy assumption, and which scenarios vary it" is a question the platform
 * exists to answer, and answering it from the event stream is what lets a subscriber react the moment an
 * assumption is disowned. The keys are registry identifiers; the statements they stand for, and the people who
 * hold them, stay on the record.
 *
 * Three events here are not the echo of something a person asked for. {@link forecastRunInvalidated} fires when
 * a run stopped reproducing from its own recorded inputs — the contract's fourth rule failing, discovered by a
 * sweep. {@link forecastRunSuperseded} fires when a newer answer replaced an older one, which is how a
 * subscriber holding a stale figure learns to stop citing it. {@link planReviewed} carries a verdict nobody has
 * to open a report to see. Those are the moments an institution most needs surfaced and the ones least likely
 * to have somebody watching a screen when they happen.
 */

// --- Observation series ----------------------------------------------------------

export const SERIES_DECLARED = "forecast.series.declared";
export const SERIES_OBSERVED = "forecast.series.observed";
export const SERIES_OBSERVATION_CORRECTED = "forecast.series.observation_corrected";
export const SERIES_OBSERVATION_WITHDRAWN = "forecast.series.observation_withdrawn";
export const SERIES_CYCLE_DECLARED = "forecast.series.cycle_declared";
export const SERIES_CLOSED = "forecast.series.closed";
export const SERIES_REOPENED = "forecast.series.reopened";

export interface SeriesEventPayload {
  readonly seriesId: Uuid;
  readonly organizationId: Uuid;
  readonly seriesKey: string;
  readonly metricKey: string;
  /** The operational domain the measured record lives in. An opaque reference outward. */
  readonly sourceDomain: string;
  /** The measured record, where there is one. Null for an institution-wide series. */
  readonly subjectRef: string | null;
  readonly grain: PeriodGrain;
  readonly direction: MetricDirection;
  readonly cycleLength: number | null;
  /** What a run pins. A subscriber holding a forecast can tell from this whether its history has moved. */
  readonly version: number;
  readonly status: SeriesStatus;
  readonly observationCount: number;
  /** The span the history now covers. Both null while the series is empty. */
  readonly firstPeriod: number | null;
  readonly lastPeriod: number | null;
  /** Whether a run could be produced from it as it now stands. */
  readonly forecastable: boolean;
}

export type SeriesDeclaredEvent = DomainEvent<typeof SERIES_DECLARED, SeriesEventPayload>;
export type SeriesObservedEvent = DomainEvent<typeof SERIES_OBSERVED, SeriesEventPayload>;
export type SeriesObservationCorrectedEvent = DomainEvent<
  typeof SERIES_OBSERVATION_CORRECTED,
  SeriesEventPayload
>;
export type SeriesObservationWithdrawnEvent = DomainEvent<
  typeof SERIES_OBSERVATION_WITHDRAWN,
  SeriesEventPayload
>;
export type SeriesCycleDeclaredEvent = DomainEvent<
  typeof SERIES_CYCLE_DECLARED,
  SeriesEventPayload
>;
export type SeriesClosedEvent = DomainEvent<typeof SERIES_CLOSED, SeriesEventPayload>;
export type SeriesReopenedEvent = DomainEvent<typeof SERIES_REOPENED, SeriesEventPayload>;

// `version` and `forecastable` travel on every series event rather than only the ones that move them. "Has the
// history behind my forecast changed" and "could a forecast be made from this at all" are the two questions a
// subscriber asks of a series at any moment, and making them answerable only by replaying the observation events
// would make the cheap questions expensive.
const seriesPayload = (series: ObservationSeries): SeriesEventPayload => ({
  seriesId: series.id,
  organizationId: series.organizationId,
  seriesKey: series.seriesKey,
  metricKey: series.metricKey,
  sourceDomain: series.sourceDomain,
  subjectRef: series.subjectRef,
  grain: series.grain,
  direction: series.direction,
  cycleLength: series.cycleLength,
  version: series.version,
  status: series.status,
  observationCount: observationCount(series),
  firstPeriod: earliestObservation(series)?.period ?? null,
  lastPeriod: latestObservation(series)?.period ?? null,
  forecastable: isSeriesForecastable(series),
});

export const seriesDeclared = (series: ObservationSeries): SeriesDeclaredEvent =>
  createEvent(SERIES_DECLARED, seriesPayload(series), { tenantId: series.tenantId });

/** One or more readings arrived. The values themselves stay on the series. */
export const seriesObserved = (series: ObservationSeries): SeriesObservedEvent =>
  createEvent(SERIES_OBSERVED, seriesPayload(series), { tenantId: series.tenantId });

/**
 * A recorded reading was restated. Emitted separately from {@link seriesObserved} because a correction
 * invalidates conclusions an addition does not — anything computed from the old value is now wrong, and a
 * subscriber cannot tell that from a version bump alone.
 */
export const seriesObservationCorrected = (
  series: ObservationSeries,
): SeriesObservationCorrectedEvent =>
  createEvent(SERIES_OBSERVATION_CORRECTED, seriesPayload(series), { tenantId: series.tenantId });

/** A reading was taken back. The history is now shorter than whatever was forecast from it. */
export const seriesObservationWithdrawn = (
  series: ObservationSeries,
): SeriesObservationWithdrawnEvent =>
  createEvent(SERIES_OBSERVATION_WITHDRAWN, seriesPayload(series), { tenantId: series.tenantId });

/** The season was declared or withdrawn. Every seasonal forecast over this series now reads differently. */
export const seriesCycleDeclared = (series: ObservationSeries): SeriesCycleDeclaredEvent =>
  createEvent(SERIES_CYCLE_DECLARED, seriesPayload(series), { tenantId: series.tenantId });

export const seriesClosed = (series: ObservationSeries): SeriesClosedEvent =>
  createEvent(SERIES_CLOSED, seriesPayload(series), { tenantId: series.tenantId });
export const seriesReopened = (series: ObservationSeries): SeriesReopenedEvent =>
  createEvent(SERIES_REOPENED, seriesPayload(series), { tenantId: series.tenantId });

// --- Forecast models -------------------------------------------------------------

export const MODEL_DRAFTED = "forecast.model.drafted";
export const MODEL_AMENDED = "forecast.model.amended";
export const MODEL_PUBLISHED = "forecast.model.published";
export const MODEL_RETIRED = "forecast.model.retired";

export interface ForecastModelEventPayload {
  readonly modelId: Uuid;
  readonly organizationId: Uuid;
  readonly modelKey: string;
  readonly method: ForecastMethod;
  /** Which knobs were set, sorted. The values are configuration detail and stay on the model. */
  readonly parameterKeys: readonly string[];
  readonly confidenceLevels: readonly ConfidenceLevel[];
  /** `0` while unpublished. With {@link ForecastModelEventPayload.modelKey}, what a run pins. */
  readonly version: number;
  readonly status: ModelStatus;
  /** Whether the method reads the series' declared cycle. */
  readonly seasonal: boolean;
  /** Whether a run may be produced from it right now. */
  readonly runnable: boolean;
}

export type ModelDraftedEvent = DomainEvent<typeof MODEL_DRAFTED, ForecastModelEventPayload>;
export type ModelAmendedEvent = DomainEvent<typeof MODEL_AMENDED, ForecastModelEventPayload>;
export type ModelPublishedEvent = DomainEvent<typeof MODEL_PUBLISHED, ForecastModelEventPayload>;
export type ModelRetiredEvent = DomainEvent<typeof MODEL_RETIRED, ForecastModelEventPayload>;

const modelPayload = (model: ForecastModel): ForecastModelEventPayload => ({
  modelId: model.id,
  organizationId: model.organizationId,
  modelKey: model.modelKey,
  method: model.method,
  parameterKeys: Object.keys(model.parameters).sort(),
  confidenceLevels: model.confidenceLevels,
  version: model.version,
  status: model.status,
  seasonal: modelReadsCycle(model),
  runnable: isModelRunnable(model),
});

export const modelDrafted = (model: ForecastModel): ModelDraftedEvent =>
  createEvent(MODEL_DRAFTED, modelPayload(model), { tenantId: model.tenantId });
export const modelAmended = (model: ForecastModel): ModelAmendedEvent =>
  createEvent(MODEL_AMENDED, modelPayload(model), { tenantId: model.tenantId });

/** The method and its parameters are frozen from here. The version in the payload is the one runs will pin. */
export const modelPublished = (model: ForecastModel): ModelPublishedEvent =>
  createEvent(MODEL_PUBLISHED, modelPayload(model), { tenantId: model.tenantId });

/** No new run may pin it. Every run that already did stays exactly as reproducible as it was. */
export const modelRetired = (model: ForecastModel): ModelRetiredEvent =>
  createEvent(MODEL_RETIRED, modelPayload(model), { tenantId: model.tenantId });

// --- Forecast runs ---------------------------------------------------------------

export const RUN_PRODUCED = "forecast.run.produced";
export const RUN_SUPERSEDED = "forecast.run.superseded";
export const RUN_INVALIDATED = "forecast.run.invalidated";

export interface ForecastRunEventPayload {
  readonly runId: Uuid;
  readonly organizationId: Uuid;
  readonly seriesId: Uuid;
  readonly seriesKey: string;
  /** The history's version as it was read. What "these observations" means, months later. */
  readonly seriesVersion: number;
  readonly modelId: Uuid;
  readonly modelKey: string;
  readonly modelVersion: number;
  readonly method: ForecastMethod;
  readonly horizon: number;
  readonly confidenceLevels: readonly ConfidenceLevel[];
  /** The declared grounds, by key. The statements and their holders stay on the run. */
  readonly assumptionKeys: readonly string[];
  readonly uncertaintyGrade: UncertaintyGrade;
  readonly uncertaintyReasons: readonly UncertaintyReason[];
  /** Future periods the method could not reach, where the last observed value stood in. */
  readonly fallbackPeriodCount: number;
  /** The reproducibility handle. Two runs sharing a digest were asked the same question of the same history. */
  readonly digest: string;
  readonly status: RunStatus;
  readonly supersededByRunId: Uuid | null;
  /** What had moved when the run stopped reproducing. Empty on anything but an invalidation. */
  readonly invalidationDrift: readonly DriftCode[];
}

export type ForecastRunProducedEvent = DomainEvent<typeof RUN_PRODUCED, ForecastRunEventPayload>;
export type ForecastRunSupersededEvent = DomainEvent<
  typeof RUN_SUPERSEDED,
  ForecastRunEventPayload
>;
export type ForecastRunInvalidatedEvent = DomainEvent<
  typeof RUN_INVALIDATED,
  ForecastRunEventPayload
>;

// The forecast values are deliberately absent, and the digest is what stands in their place. A subscriber that
// needs the numbers reads the run; a subscriber that only needs to know whether the numbers changed compares two
// digests, which is cheaper than either party carrying them.
const runPayload = (run: ForecastRun): ForecastRunEventPayload => ({
  runId: run.id,
  organizationId: run.organizationId,
  seriesId: run.seriesId,
  seriesKey: run.seriesKey,
  seriesVersion: run.seriesVersion,
  modelId: run.modelId,
  modelKey: run.modelKey,
  modelVersion: run.modelVersion,
  method: run.method,
  horizon: run.horizon,
  confidenceLevels: run.confidenceLevels,
  assumptionKeys: run.assumptions.map((assumption) => assumption.assumptionKey),
  uncertaintyGrade: run.uncertainty.grade,
  uncertaintyReasons: run.uncertainty.reasons,
  fallbackPeriodCount: run.fallbackPeriods.length,
  digest: run.digest,
  status: run.status,
  supersededByRunId: run.supersededByRunId,
  invalidationDrift: run.invalidationDrift,
});

export const forecastRunProduced = (run: ForecastRun): ForecastRunProducedEvent =>
  createEvent(RUN_PRODUCED, runPayload(run), { tenantId: run.tenantId });

/** A newer forecast replaced this one. Whoever is still citing it should stop. */
export const forecastRunSuperseded = (run: ForecastRun): ForecastRunSupersededEvent =>
  createEvent(RUN_SUPERSEDED, runPayload(run), { tenantId: run.tenantId });

/**
 * The run no longer reproduces from its own recorded inputs — the contract's fourth rule failing on a record
 * already on the institution's file. The drift codes say what moved, so a subscriber can tell a corrected
 * history from a changed model without opening anything.
 */
export const forecastRunInvalidated = (run: ForecastRun): ForecastRunInvalidatedEvent =>
  createEvent(RUN_INVALIDATED, runPayload(run), { tenantId: run.tenantId });

// --- Backtests -------------------------------------------------------------------

export const BACKTEST_SCORED = "forecast.backtest.scored";

export interface BacktestEventPayload {
  readonly backtestId: Uuid;
  readonly organizationId: Uuid;
  readonly seriesId: Uuid;
  readonly seriesKey: string;
  readonly seriesVersion: number;
  readonly modelId: Uuid;
  readonly modelKey: string;
  readonly modelVersion: number;
  readonly method: ForecastMethod;
  readonly holdoutSize: number;
  readonly trainingCount: number;
  /** How many held-back periods were actually scored. Below the holdout where the history had gaps. */
  readonly sampleSize: number;
  readonly meanAbsoluteError: number;
  readonly rootMeanSquaredError: number;
  readonly meanAbsolutePercentageError: number | null;
  readonly skillScore: number;
  readonly intervalCoverage: number;
  readonly coverageLevel: ConfidenceLevel;
  readonly calibration: CalibrationVerdict;
  /** Whether it did better than assuming next period looks like this one. */
  readonly beatsBaseline: boolean;
  /** Whether the intervals told the truth about themselves. */
  readonly intervalsHonest: boolean;
  /** The publication verdict, frozen at scoring. What a model's publication is allowed to rest on. */
  readonly publishable: boolean;
}

export type BacktestScoredEvent = DomainEvent<typeof BACKTEST_SCORED, BacktestEventPayload>;

// The one place in this domain where the numbers travel whole. A backtest is a verdict about a model rather than
// a statement about the institution: every figure here is an error measured against history the model was not
// fitted on, and withholding them would leave the accuracy gate asserting a verdict nobody outside can check.
const backtestPayload = (backtest: Backtest): BacktestEventPayload => ({
  backtestId: backtest.id,
  organizationId: backtest.organizationId,
  seriesId: backtest.seriesId,
  seriesKey: backtest.seriesKey,
  seriesVersion: backtest.seriesVersion,
  modelId: backtest.modelId,
  modelKey: backtest.modelKey,
  modelVersion: backtest.modelVersion,
  method: backtest.method,
  holdoutSize: backtest.holdoutSize,
  trainingCount: backtest.trainingCount,
  sampleSize: backtest.scores.sampleSize,
  meanAbsoluteError: backtest.scores.meanAbsoluteError,
  rootMeanSquaredError: backtest.scores.rootMeanSquaredError,
  meanAbsolutePercentageError: backtest.scores.meanAbsolutePercentageError,
  skillScore: backtest.scores.skillScore,
  intervalCoverage: backtest.scores.intervalCoverage,
  coverageLevel: backtest.scores.coverageLevel,
  calibration: backtest.scores.calibration,
  beatsBaseline: beatsBaseline(backtest),
  intervalsHonest: intervalsAreHonest(backtest),
  publishable: backtest.publishable,
});

/** A model was measured against history it had not seen. There is no other event: a backtest is never edited. */
export const backtestScored = (backtest: Backtest): BacktestScoredEvent =>
  createEvent(BACKTEST_SCORED, backtestPayload(backtest), { tenantId: backtest.tenantId });

// --- Scenarios -------------------------------------------------------------------

export const SCENARIO_DECLARED = "forecast.scenario.declared";
export const SCENARIO_AMENDED = "forecast.scenario.amended";
export const SCENARIO_LEVERS_CHANGED = "forecast.scenario.levers_changed";
export const SCENARIO_PUBLISHED = "forecast.scenario.published";
export const SCENARIO_ARCHIVED = "forecast.scenario.archived";

export interface ScenarioEventPayload {
  readonly scenarioId: Uuid;
  readonly organizationId: Uuid;
  readonly scenarioKey: string;
  /** The levers by key, in application order. Their magnitudes are the what-if itself and stay on the record. */
  readonly leverKeys: readonly string[];
  readonly leverCount: number;
  /** The declared beliefs this scenario varies. Empty where its levers are bound to none. */
  readonly variedAssumptionKeys: readonly string[];
  /** Whether any lever discards the projection outright rather than moving it. */
  readonly overridesBaseline: boolean;
  /** The lever set's identity. Frozen at publication, which is what a simulation run pins. */
  readonly version: number;
  readonly status: ScenarioStatus;
  /** Whether it may be run against a baseline right now. */
  readonly simulable: boolean;
}

export type ScenarioDeclaredEvent = DomainEvent<typeof SCENARIO_DECLARED, ScenarioEventPayload>;
export type ScenarioAmendedEvent = DomainEvent<typeof SCENARIO_AMENDED, ScenarioEventPayload>;
export type ScenarioLeversChangedEvent = DomainEvent<
  typeof SCENARIO_LEVERS_CHANGED,
  ScenarioEventPayload
>;
export type ScenarioPublishedEvent = DomainEvent<typeof SCENARIO_PUBLISHED, ScenarioEventPayload>;
export type ScenarioArchivedEvent = DomainEvent<typeof SCENARIO_ARCHIVED, ScenarioEventPayload>;

const scenarioPayload = (scenario: Scenario): ScenarioEventPayload => ({
  scenarioId: scenario.id,
  organizationId: scenario.organizationId,
  scenarioKey: scenario.scenarioKey,
  leverKeys: scenario.levers.map((lever) => lever.leverKey),
  leverCount: leverCount(scenario),
  variedAssumptionKeys: variedAssumptionKeys(scenario),
  overridesBaseline: overridesBaseline(scenario),
  version: scenario.version,
  status: scenario.status,
  simulable: isScenarioSimulable(scenario),
});

export const scenarioDeclared = (scenario: Scenario): ScenarioDeclaredEvent =>
  createEvent(SCENARIO_DECLARED, scenarioPayload(scenario), { tenantId: scenario.tenantId });

/** The name or description was restated. The version does not move, because nothing arithmetic did. */
export const scenarioAmended = (scenario: Scenario): ScenarioAmendedEvent =>
  createEvent(SCENARIO_AMENDED, scenarioPayload(scenario), { tenantId: scenario.tenantId });

/**
 * A lever was added, restated or taken away. One event for all three, because the thing a subscriber cares
 * about is that the lever set is now a different lever set — which the version in the payload states exactly.
 */
export const scenarioLeversChanged = (scenario: Scenario): ScenarioLeversChangedEvent =>
  createEvent(SCENARIO_LEVERS_CHANGED, scenarioPayload(scenario), { tenantId: scenario.tenantId });

/** The levers are frozen from here. The version in the payload is the one simulation runs will pin. */
export const scenarioPublished = (scenario: Scenario): ScenarioPublishedEvent =>
  createEvent(SCENARIO_PUBLISHED, scenarioPayload(scenario), { tenantId: scenario.tenantId });

/** No new simulation may pin it. Every run that already did stays exactly as readable as it was. */
export const scenarioArchived = (scenario: Scenario): ScenarioArchivedEvent =>
  createEvent(SCENARIO_ARCHIVED, scenarioPayload(scenario), { tenantId: scenario.tenantId });

// --- Simulation runs -------------------------------------------------------------

export const SIMULATION_PRODUCED = "forecast.simulation.produced";
export const SIMULATION_SUPERSEDED = "forecast.simulation.superseded";

export interface SimulationRunEventPayload {
  readonly simulationRunId: Uuid;
  readonly organizationId: Uuid;
  readonly scenarioId: Uuid;
  readonly scenarioKey: string;
  readonly scenarioVersion: number;
  readonly forecastRunId: Uuid;
  /** The baseline's input digest. Says what was forecast even after that run is superseded. */
  readonly forecastRunDigest: string;
  readonly seriesKey: string;
  readonly seriesVersion: number;
  readonly modelKey: string;
  readonly modelVersion: number;
  readonly method: ForecastMethod;
  readonly horizon: number;
  readonly variedAssumptionKeys: readonly string[];
  /**
   * The whole-projection movement as a proportion of the baseline, or null where the baseline sums to zero.
   * A ratio rather than a total on purpose: "this scenario moves the number by nine per cent" is what a
   * subscriber needs, and it says nothing about nine per cent of what.
   */
  readonly relativeTotalDelta: number | null;
  /** How many periods the levers actually moved. Zero where every lever was inadmissible or started too late. */
  readonly movedPeriodCount: number;
  /** The baseline's grade, carried forward. A scenario is never more certain than what it moves. */
  readonly inheritedUncertainty: UncertaintyGrade;
  readonly overridden: boolean;
  /** Levers that touched nothing. A non-empty list means the scenario did less than it says it does. */
  readonly unappliedLeverKeys: readonly string[];
  readonly fullyApplied: boolean;
  readonly status: SimulationStatus;
  readonly supersededByRunId: Uuid | null;
}

export type SimulationRunProducedEvent = DomainEvent<
  typeof SIMULATION_PRODUCED,
  SimulationRunEventPayload
>;
export type SimulationRunSupersededEvent = DomainEvent<
  typeof SIMULATION_SUPERSEDED,
  SimulationRunEventPayload
>;

const simulationPayload = (run: SimulationRun): SimulationRunEventPayload => ({
  simulationRunId: run.id,
  organizationId: run.organizationId,
  scenarioId: run.scenarioId,
  scenarioKey: run.scenarioKey,
  scenarioVersion: run.scenarioVersion,
  forecastRunId: run.forecastRunId,
  forecastRunDigest: run.forecastRunDigest,
  seriesKey: run.seriesKey,
  seriesVersion: run.seriesVersion,
  modelKey: run.modelKey,
  modelVersion: run.modelVersion,
  method: run.method,
  horizon: run.horizon,
  variedAssumptionKeys: run.variedAssumptionKeys,
  relativeTotalDelta: relativeTotalDelta(run),
  movedPeriodCount: movedPeriods(run).length,
  inheritedUncertainty: run.inheritedUncertainty,
  overridden: run.overridden,
  unappliedLeverKeys: run.unappliedLeverKeys,
  fullyApplied: fullyApplied(run),
  status: run.status,
  supersededByRunId: run.supersededByRunId,
});

export const simulationRunProduced = (run: SimulationRun): SimulationRunProducedEvent =>
  createEvent(SIMULATION_PRODUCED, simulationPayload(run), { tenantId: run.tenantId });

/** A newer what-if replaced this one, usually because the baseline underneath it moved. */
export const simulationRunSuperseded = (run: SimulationRun): SimulationRunSupersededEvent =>
  createEvent(SIMULATION_SUPERSEDED, simulationPayload(run), { tenantId: run.tenantId });

// --- Strategic plans -------------------------------------------------------------

export const PLAN_DRAFTED = "forecast.plan.drafted";
export const PLAN_AMENDED = "forecast.plan.amended";
export const PLAN_OBJECTIVES_CHANGED = "forecast.plan.objectives_changed";
export const PLAN_ACTIVATED = "forecast.plan.activated";
export const PLAN_PROGRESS_RECORDED = "forecast.plan.progress_recorded";
export const PLAN_REVIEWED = "forecast.plan.reviewed";
export const PLAN_COMPLETED = "forecast.plan.completed";
export const PLAN_ABANDONED = "forecast.plan.abandoned";

export interface StrategicPlanEventPayload {
  readonly planId: Uuid;
  readonly organizationId: Uuid;
  readonly planKey: string;
  /** The objectives by key, sorted. Their baselines and targets stay on the plan. */
  readonly objectiveKeys: readonly string[];
  /** The metrics the objectives track, sorted and deduplicated. What a series subscriber routes on. */
  readonly metricKeys: readonly string[];
  readonly objectiveCount: number;
  readonly startPeriod: number;
  /** The objective set's identity. Frozen at activation, which is what every review pins. */
  readonly version: number;
  readonly status: PlanStatus;
  readonly progressCount: number;
  readonly reviewCount: number;
}

/**
 * A plan review as it goes on the wire: the verdict, never the readings.
 *
 * The counts and the state are classifications of the institution's own position against commitments it made
 * publicly, which is exactly the thing a leadership subscriber should be able to see without opening a report.
 * The values behind them — what attendance actually was, what the balance actually is — stay on the plan, and a
 * subscriber that needs them reads it.
 */
export interface PlanReviewEventPayload extends StrategicPlanEventPayload {
  readonly period: number;
  /** The objective-set version this review was taken against. Equals the plan's, and is stated rather than implied. */
  readonly planVersion: number;
  /** The worst state across the objectives — the honest headline for a plan taken as a whole. */
  readonly state: TrackingState;
  readonly onTrackCount: number;
  readonly atRiskCount: number;
  readonly offTrackCount: number;
  readonly achievedCount: number;
  readonly missedCount: number;
  /** Objectives nothing had been recorded for by the reviewed period. A review of a blank is not a review. */
  readonly unmeasuredObjectiveKeys: readonly string[];
}

export type PlanDraftedEvent = DomainEvent<typeof PLAN_DRAFTED, StrategicPlanEventPayload>;
export type PlanAmendedEvent = DomainEvent<typeof PLAN_AMENDED, StrategicPlanEventPayload>;
export type PlanObjectivesChangedEvent = DomainEvent<
  typeof PLAN_OBJECTIVES_CHANGED,
  StrategicPlanEventPayload
>;
export type PlanActivatedEvent = DomainEvent<typeof PLAN_ACTIVATED, StrategicPlanEventPayload>;
export type PlanProgressRecordedEvent = DomainEvent<
  typeof PLAN_PROGRESS_RECORDED,
  StrategicPlanEventPayload
>;
export type PlanReviewedEvent = DomainEvent<typeof PLAN_REVIEWED, PlanReviewEventPayload>;
export type PlanCompletedEvent = DomainEvent<typeof PLAN_COMPLETED, StrategicPlanEventPayload>;
export type PlanAbandonedEvent = DomainEvent<typeof PLAN_ABANDONED, StrategicPlanEventPayload>;

const planPayload = (plan: StrategicPlan): StrategicPlanEventPayload => ({
  planId: plan.id,
  organizationId: plan.organizationId,
  planKey: plan.planKey,
  objectiveKeys: plan.objectives.map((objective) => objective.objectiveKey),
  metricKeys: [...new Set(plan.objectives.map((objective) => objective.metricKey))].sort(),
  objectiveCount: objectiveCount(plan),
  startPeriod: plan.startPeriod,
  version: plan.version,
  status: plan.status,
  progressCount: plan.progress.length,
  reviewCount: plan.reviews.length,
});

export const planDrafted = (plan: StrategicPlan): PlanDraftedEvent =>
  createEvent(PLAN_DRAFTED, planPayload(plan), { tenantId: plan.tenantId });

/** The name or description was restated. Permitted on an active plan; the version does not move. */
export const planAmended = (plan: StrategicPlan): PlanAmendedEvent =>
  createEvent(PLAN_AMENDED, planPayload(plan), { tenantId: plan.tenantId });

/**
 * The objective set changed, which can only have happened while the plan was still a draft. The version in the
 * payload is the new identity — every review taken from here pins it.
 */
export const planObjectivesChanged = (plan: StrategicPlan): PlanObjectivesChangedEvent =>
  createEvent(PLAN_OBJECTIVES_CHANGED, planPayload(plan), { tenantId: plan.tenantId });

/** The institution committed. From here the objectives are frozen and progress may be recorded against them. */
export const planActivated = (plan: StrategicPlan): PlanActivatedEvent =>
  createEvent(PLAN_ACTIVATED, planPayload(plan), { tenantId: plan.tenantId });

/** Readings arrived against one or more objectives. The values stay on the plan; the count says they landed. */
export const planProgressRecorded = (plan: StrategicPlan): PlanProgressRecordedEvent =>
  createEvent(PLAN_PROGRESS_RECORDED, planPayload(plan), { tenantId: plan.tenantId });

/**
 * A review was taken, and this is its verdict.
 *
 * The review is passed alongside the plan rather than read back off it, so the event is total: there is no path
 * where a caller holds a plan whose last review is not the one being announced, and none where this has to
 * guess at an empty list.
 */
export const planReviewed = (plan: StrategicPlan, review: PlanReview): PlanReviewedEvent =>
  createEvent(
    PLAN_REVIEWED,
    {
      ...planPayload(plan),
      period: review.period,
      planVersion: review.planVersion,
      state: review.variance.state,
      onTrackCount: review.variance.onTrackCount,
      atRiskCount: review.variance.atRiskCount,
      offTrackCount: review.variance.offTrackCount,
      achievedCount: review.variance.achievedCount,
      missedCount: review.variance.missedCount,
      unmeasuredObjectiveKeys: unmeasuredObjectiveKeys(plan, review.period),
    },
    { tenantId: plan.tenantId },
  );

/** The plan ran its course. Nothing here claims the targets were met — the reviews say that. */
export const planCompleted = (plan: StrategicPlan): PlanCompletedEvent =>
  createEvent(PLAN_COMPLETED, planPayload(plan), { tenantId: plan.tenantId });

/** The institution stopped. The reason is on the record, where a person reads it deliberately. */
export const planAbandoned = (plan: StrategicPlan): PlanAbandonedEvent =>
  createEvent(PLAN_ABANDONED, planPayload(plan), { tenantId: plan.tenantId });
