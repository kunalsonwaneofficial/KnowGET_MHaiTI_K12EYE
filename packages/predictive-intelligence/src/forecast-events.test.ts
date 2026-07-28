import { describe, expect, it } from "vitest";

import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { runBacktest } from "./backtest";
import {
  BACKTEST_SCORED,
  MODEL_DRAFTED,
  MODEL_PUBLISHED,
  MODEL_RETIRED,
  PLAN_ABANDONED,
  PLAN_ACTIVATED,
  PLAN_COMPLETED,
  PLAN_DRAFTED,
  PLAN_OBJECTIVES_CHANGED,
  PLAN_REVIEWED,
  RUN_INVALIDATED,
  RUN_PRODUCED,
  RUN_SUPERSEDED,
  SCENARIO_DECLARED,
  SCENARIO_LEVERS_CHANGED,
  SCENARIO_PUBLISHED,
  SERIES_CLOSED,
  SERIES_CYCLE_DECLARED,
  SERIES_DECLARED,
  SIMULATION_PRODUCED,
  SIMULATION_SUPERSEDED,
  backtestScored,
  forecastRunInvalidated,
  forecastRunProduced,
  forecastRunSuperseded,
  modelAmended,
  modelDrafted,
  modelPublished,
  modelRetired,
  planAbandoned,
  planActivated,
  planAmended,
  planCompleted,
  planDrafted,
  planObjectivesChanged,
  planProgressRecorded,
  planReviewed,
  scenarioAmended,
  scenarioArchived,
  scenarioDeclared,
  scenarioLeversChanged,
  scenarioPublished,
  seriesClosed,
  seriesCycleDeclared,
  seriesDeclared,
  seriesObservationCorrected,
  seriesObservationWithdrawn,
  seriesObserved,
  seriesReopened,
  simulationRunProduced,
  simulationRunSuperseded,
} from "./forecast-events";
import type { ForecastModel, ForecastModelParams } from "./forecast-model";
import { draftForecastModel, publishModel, retireModel } from "./forecast-model";
import type { ForecastRun } from "./forecast-run";
import { invalidateRun, produceForecastRun, runInputs, supersedeRun } from "./forecast-run";
import type { AssumptionView } from "./forecast-view";
import type { ObservationSeries, ObservationSeriesParams } from "./observation-series";
import {
  closeSeries,
  correctObservation,
  declareCycleLength,
  declareObservationSeries,
  recordObservations,
  reopenSeries,
  withdrawObservation,
} from "./observation-series";
import type { LeverInput, Scenario, ScenarioParams } from "./scenario";
import {
  addLever,
  amendScenario,
  archiveScenario,
  declareScenario,
  publishScenario,
} from "./scenario";
import { produceSimulationRun, supersedeSimulationRun } from "./simulation-run";
import type { ObjectiveInput, PlanReview, StrategicPlan } from "./strategic-plan";
import {
  abandonPlan,
  activatePlan,
  amendPlan,
  completePlan,
  draftStrategicPlan,
  latestReview,
  recordProgress,
  removeObjective,
  reviewPlan,
} from "./strategic-plan";

const TENANT = "11111111-1111-4111-8111-111111111111" as TenantId;
const ORGANIZATION = "22222222-2222-4222-8222-222222222222" as Uuid;
const REPLACEMENT = "33333333-3333-4333-8333-333333333333" as Uuid;
const ANALYST = "44444444-4444-4444-8444-444444444444" as Uuid;
const LEADER = "55555555-5555-4555-8555-555555555555" as Uuid;
const HOLDER = "66666666-6666-4666-8666-666666666666" as Uuid;

/**
 * Every word this domain holds, gathered in one place.
 *
 * Each string below is written into an aggregate and must never reappear in a payload. The last block in this
 * file is the sweep that proves it across every event this module can produce; naming them here is what keeps
 * that sweep honest as the module grows.
 */
const SERIES_UNIT = "percentage points of sessions attended";
const OBSERVATION_LABEL = "Michaelmas half-term, 2026";
const MODEL_NAME = "Attendance linear trend";
const MODEL_DESCRIPTION = "Least squares over the whole register, refitted each half-term";
const SCENARIO_NAME = "Austerity case 2027";
const SCENARIO_DESCRIPTION = "The board case where the renewal grant does not arrive";
const PLAN_NAME = "Growth 2027";
const PLAN_DESCRIPTION = "Three years of attendance recovery, agreed with the trust";
const REVIEW_NOTE = "Halfway, and the absence line is the one to watch";
const ABANDONMENT_REASON = "The trust withdrew the funding the plan was built on";
const ASSUMPTION_REFERENCE = "Minute 14 of the finance committee, 3 March";

const FREE_TEXT = [
  SERIES_UNIT,
  OBSERVATION_LABEL,
  MODEL_NAME,
  MODEL_DESCRIPTION,
  SCENARIO_NAME,
  SCENARIO_DESCRIPTION,
  PLAN_NAME,
  PLAN_DESCRIPTION,
  REVIEW_NOTE,
  ABANDONMENT_REASON,
  ASSUMPTION_REFERENCE,
];

const PEOPLE = [ANALYST, LEADER, HOLDER];

/**
 * Every level this domain measures or projects: the twelve readings behind the fixtures, the three points the
 * linear fit produces from them, and the plan's own baselines and targets.
 *
 * `100` is deliberately absent. It is both the eleventh reading and the backtest's interval coverage, and a
 * numeric sweep cannot tell those apart — the backtest's figures being the one documented exception to the rule
 * this list enforces, the single value where the two sets overlap is left to the backtest's own assertions.
 *
 * The plan's own figures sit in the thirties and forties for the same reason: periods, counts, versions and
 * horizons are all small integers, and a target of `10` would collide with a period index rather than prove
 * anything about what travels.
 */
const LEVELS = [
  ...Array.from({ length: 12 }, (_, index) => 90 + index).filter((value) => value !== 100),
  102,
  103,
  104,
  96,
  42,
  31,
  35,
];

// --- Series fixtures -------------------------------------------------------------

const seriesOf = (
  values: readonly number[],
  overrides: Partial<ObservationSeriesParams> = {},
): ObservationSeries =>
  recordObservations(
    declareObservationSeries({
      tenantId: TENANT,
      organizationId: ORGANIZATION,
      seriesKey: "attendance.rate.grade7",
      metricKey: "attendance.rate",
      sourceDomain: "attendance",
      grain: "month",
      direction: "higher_is_better",
      unit: SERIES_UNIT,
      ...overrides,
    }),
    values.map((value, index) => ({
      period: index,
      value,
      label: index === 0 ? OBSERVATION_LABEL : `2026-${String(index + 1).padStart(2, "0")}`,
    })),
  );

/** A straight line, `90 + period`, so a linear fit reproduces it exactly and the arithmetic stays checkable. */
const series = (overrides: Partial<ObservationSeriesParams> = {}): ObservationSeries =>
  seriesOf(
    Array.from({ length: 12 }, (_, index) => 90 + index),
    overrides,
  );

const empty = (): ObservationSeries =>
  declareObservationSeries({
    tenantId: TENANT,
    organizationId: ORGANIZATION,
    seriesKey: "attendance.rate.grade8",
    metricKey: "attendance.rate",
    sourceDomain: "attendance",
    grain: "month",
    direction: "higher_is_better",
  });

// --- Model fixtures --------------------------------------------------------------

const draftModel = (overrides: Partial<ForecastModelParams> = {}): ForecastModel =>
  draftForecastModel({
    tenantId: TENANT,
    organizationId: ORGANIZATION,
    modelKey: "attendance.linear",
    name: MODEL_NAME,
    description: MODEL_DESCRIPTION,
    method: "linear_trend",
    ...overrides,
  });

const model = (overrides: Partial<ForecastModelParams> = {}, version = 1): ForecastModel =>
  publishModel(draftModel(overrides), version);

// --- Run fixtures ----------------------------------------------------------------

const CONTINUITY: AssumptionView = {
  assumptionKey: "intake_flat",
  kind: "continuity",
  basis: "observed_history",
  holderId: null,
  reference: null,
  expectedValue: null,
};

/** A declared belief with a person behind it and a minute reference, so both have a chance to leak. */
const POLICY: AssumptionView = {
  assumptionKey: "fee_policy_held",
  kind: "policy",
  basis: "declared_policy",
  holderId: HOLDER,
  reference: ASSUMPTION_REFERENCE,
  expectedValue: null,
};

const run = (history: ObservationSeries = series()): ForecastRun =>
  produceForecastRun({
    series: history,
    model: model(),
    horizon: 3,
    assumptions: [CONTINUITY, POLICY],
    producedByUserId: ANALYST,
  });

// --- Scenario fixtures -----------------------------------------------------------

const UPLIFT: LeverInput = {
  leverKey: "fee.uplift",
  kind: "additive",
  magnitude: 3,
  assumptionKey: "intake_flat",
};

/** An override that starts past the end of a three-period projection, so it is configured but never applied. */
const LATE_OVERRIDE: LeverInput = {
  leverKey: "late.start",
  kind: "override",
  magnitude: 50,
  fromHorizon: 9,
};

const draftScenario = (overrides: Partial<ScenarioParams> = {}): Scenario =>
  declareScenario({
    tenantId: TENANT,
    organizationId: ORGANIZATION,
    scenarioKey: "budget.austerity.2027",
    name: SCENARIO_NAME,
    description: SCENARIO_DESCRIPTION,
    levers: [UPLIFT],
    ...overrides,
  });

const scenario = (overrides: Partial<ScenarioParams> = {}): Scenario =>
  publishScenario(draftScenario(overrides));

const simulation = (levers: readonly LeverInput[] = [UPLIFT]) =>
  produceSimulationRun({
    scenario: scenario({ levers }),
    forecastRun: run(),
    ranByUserId: ANALYST,
  });

// --- Plan fixtures ---------------------------------------------------------------

const ATTENDANCE: ObjectiveInput = {
  objectiveKey: "attendance.rate",
  metricKey: "attendance.rate",
  direction: "higher_is_better",
  baselineValue: 90,
  targetValue: 96,
  targetPeriod: 12,
};

const ABSENCE: ObjectiveInput = {
  objectiveKey: "chronic.absence",
  metricKey: "absence.chronic",
  direction: "lower_is_better",
  baselineValue: 42,
  targetValue: 31,
  targetPeriod: 12,
};

const draftPlan = (objectives: readonly ObjectiveInput[] = [ATTENDANCE, ABSENCE]): StrategicPlan =>
  draftStrategicPlan({
    tenantId: TENANT,
    organizationId: ORGANIZATION,
    planKey: "growth.2027",
    name: PLAN_NAME,
    description: PLAN_DESCRIPTION,
    startPeriod: 0,
    objectives,
  });

const activePlan = (): StrategicPlan => activatePlan(draftPlan(), LEADER);

/** Attendance already at its target, absence a little ahead of its line: one achieved, one on track. */
const measuredPlan = (): StrategicPlan =>
  recordProgress(activePlan(), [
    { objectiveKey: "attendance.rate", period: 6, actualValue: 96 },
    { objectiveKey: "chronic.absence", period: 6, actualValue: 35 },
  ]);

const reviewedPlan = (plan: StrategicPlan = measuredPlan()): StrategicPlan =>
  reviewPlan(plan, { period: 6, reviewedByUserId: LEADER, note: REVIEW_NOTE });

const reviewOf = (plan: StrategicPlan): PlanReview => {
  const review = latestReview(plan);
  if (review === null) throw new Error("fixture has no review");
  return review;
};

// --- Series ----------------------------------------------------------------------

describe("what an observation series broadcasts", () => {
  it("names the metric, the subject and the span — and none of the readings", () => {
    const event = seriesDeclared(series());

    expect(event.type).toBe(SERIES_DECLARED);
    expect(event.metadata.tenantId).toBe(TENANT);
    expect(event.payload).toMatchObject({
      organizationId: ORGANIZATION,
      seriesKey: "attendance.rate.grade7",
      metricKey: "attendance.rate",
      sourceDomain: "attendance",
      subjectRef: null,
      grain: "month",
      direction: "higher_is_better",
      cycleLength: null,
      version: 2,
      status: "active",
      observationCount: 12,
      firstPeriod: 0,
      lastPeriod: 11,
      forecastable: true,
    });
  });

  it("carries the subject reference where the series measures a named record", () => {
    const event = seriesDeclared(series({ subjectRef: "student-7781" }));

    expect(event.payload.subjectRef).toBe("student-7781");
    expect(event.payload.sourceDomain).toBe("attendance");
  });

  it("says an empty series is unforecastable and has no span at all", () => {
    expect(seriesDeclared(empty()).payload).toMatchObject({
      observationCount: 0,
      firstPeriod: null,
      lastPeriod: null,
      forecastable: false,
      version: 1,
    });
  });

  it("moves the version on every reading that changes the history", () => {
    expect(seriesObserved(series()).payload.version).toBe(2);
    expect(seriesObservationCorrected(correctObservation(series(), 3, 80)).payload).toMatchObject({
      version: 3,
      observationCount: 12,
    });
    expect(seriesObservationWithdrawn(withdrawObservation(series(), 11)).payload).toMatchObject({
      version: 3,
      observationCount: 11,
      lastPeriod: 10,
    });
  });

  it("announces a declared season, because every seasonal forecast over it now reads differently", () => {
    const event = seriesCycleDeclared(declareCycleLength(series(), 4));

    expect(event.type).toBe(SERIES_CYCLE_DECLARED);
    expect(event.payload).toMatchObject({ cycleLength: 4, version: 3 });
  });

  it("leaves the version where it was when only the status moved", () => {
    const closed = closeSeries(series());
    const event = seriesClosed(closed);

    expect(event.type).toBe(SERIES_CLOSED);
    expect(event.payload).toMatchObject({ status: "closed", version: 2 });
    expect(seriesReopened(reopenSeries(closed)).payload).toMatchObject({
      status: "active",
      version: 2,
    });
  });

  it("still calls a closed series forecastable, because a frozen history is a complete one", () => {
    expect(seriesClosed(closeSeries(series())).payload.forecastable).toBe(true);
  });
});

// --- Models ----------------------------------------------------------------------

describe("what a forecast model broadcasts", () => {
  it("names the method and which knobs were set, never what they were set to", () => {
    const event = modelDrafted(draftModel());

    expect(event.type).toBe(MODEL_DRAFTED);
    expect(event.metadata.tenantId).toBe(TENANT);
    expect(event.payload).toMatchObject({
      organizationId: ORGANIZATION,
      modelKey: "attendance.linear",
      method: "linear_trend",
      parameterKeys: [],
      confidenceLevels: [80],
      version: 0,
      status: "draft",
      seasonal: false,
      runnable: false,
    });
  });

  it("lists the parameters the method actually reads, sorted", () => {
    const moving = draftModel({
      modelKey: "attendance.moving",
      method: "moving_average",
      parameters: { windowSize: 4 },
    });

    expect(modelAmended(moving).payload.parameterKeys).toEqual(["windowSize"]);
  });

  it("says whether the method reads the series' season, so a subscriber need not know the methods", () => {
    const seasonal = draftModel({ modelKey: "attendance.seasonal", method: "seasonal_naive" });

    expect(modelDrafted(seasonal).payload.seasonal).toBe(true);
    expect(modelDrafted(draftModel()).payload.seasonal).toBe(false);
  });

  it("carries the version runs will pin, and the required level whether or not it was asked for", () => {
    const event = modelPublished(model({ confidenceLevels: [50, 95] }, 3));

    expect(event.type).toBe(MODEL_PUBLISHED);
    expect(event.payload).toMatchObject({
      version: 3,
      status: "published",
      confidenceLevels: [50, 80, 95],
      runnable: true,
    });
  });

  it("keeps the version on a retirement, and says no new run may pin it", () => {
    const event = modelRetired(retireModel(model()));

    expect(event.type).toBe(MODEL_RETIRED);
    expect(event.payload).toMatchObject({ status: "retired", version: 1, runnable: false });
  });
});

// --- Runs ------------------------------------------------------------------------

describe("what a forecast run broadcasts", () => {
  it("carries the shape of the answer and the digest, never the answer", () => {
    const produced = run();
    const event = forecastRunProduced(produced);

    expect(event.type).toBe(RUN_PRODUCED);
    expect(event.metadata.tenantId).toBe(TENANT);
    expect(event.payload).toMatchObject({
      runId: produced.id,
      organizationId: ORGANIZATION,
      seriesKey: "attendance.rate.grade7",
      seriesVersion: 2,
      modelKey: "attendance.linear",
      modelVersion: 1,
      method: "linear_trend",
      horizon: 3,
      confidenceLevels: [80],
      uncertaintyGrade: "tight",
      uncertaintyReasons: [],
      fallbackPeriodCount: 0,
      digest: produced.digest,
      status: "completed",
      supersededByRunId: null,
      invalidationDrift: [],
    });
    expect(event.payload).not.toHaveProperty("points");
  });

  it("names the declared grounds by key, in the order they were declared", () => {
    expect(forecastRunProduced(run()).payload.assumptionKeys).toEqual([
      "intake_flat",
      "fee_policy_held",
    ]);
  });

  it("reports the uncertainty the run reached rather than the one its inputs deserved", () => {
    const noisy = seriesOf([90, 130, 70, 145, 62, 138, 74, 129, 68, 141, 71, 133]);
    const graded = produceForecastRun({
      series: noisy,
      model: model({ modelKey: "attendance.moving", method: "moving_average" }),
      horizon: 3,
      assumptions: [CONTINUITY],
      producedByUserId: ANALYST,
    });

    expect(forecastRunProduced(graded).payload.uncertaintyGrade).toBe("unusable");
  });

  it("names the successor on a supersession, so a stale citation can be walked forward", () => {
    const event = forecastRunSuperseded(supersedeRun(run(), REPLACEMENT));

    expect(event.type).toBe(RUN_SUPERSEDED);
    expect(event.payload).toMatchObject({
      status: "superseded",
      supersededByRunId: REPLACEMENT,
      invalidationDrift: [],
    });
  });

  it("says what had moved when a run stopped reproducing, without changing its digest", () => {
    const original = run();
    const shadow = run(correctObservation(series(), 3, 80));
    const event = forecastRunInvalidated(invalidateRun(original, runInputs(shadow), shadow.points));

    expect(event.type).toBe(RUN_INVALIDATED);
    expect(event.payload.status).toBe("invalidated");
    expect(event.payload.invalidationDrift).toEqual(["series_version_changed", "values_changed"]);
    expect(event.payload.digest).toBe(original.digest);
  });
});

// --- Backtests -------------------------------------------------------------------

describe("what a backtest broadcasts", () => {
  it("puts every score on the wire, because a verdict about a model has to be checkable", () => {
    const backtest = runBacktest({
      series: series(),
      model: model(),
      holdoutSize: 3,
      ranByUserId: ANALYST,
    });
    const event = backtestScored(backtest);

    expect(event.type).toBe(BACKTEST_SCORED);
    expect(event.metadata.tenantId).toBe(TENANT);
    expect(event.payload).toMatchObject({
      backtestId: backtest.id,
      organizationId: ORGANIZATION,
      seriesKey: "attendance.rate.grade7",
      seriesVersion: 2,
      modelKey: "attendance.linear",
      modelVersion: 1,
      method: "linear_trend",
      holdoutSize: 3,
      trainingCount: 9,
      sampleSize: 3,
      meanAbsoluteError: 0,
      rootMeanSquaredError: 0,
      meanAbsolutePercentageError: 0,
      skillScore: 1,
      intervalCoverage: 100,
      coverageLevel: 80,
      calibration: "underconfident",
    });
  });

  it("carries the two verdicts a publication rests on, decided rather than left to be recomputed", () => {
    const event = backtestScored(
      runBacktest({ series: series(), model: model(), holdoutSize: 3, ranByUserId: ANALYST }),
    );

    expect(event.payload).toMatchObject({
      beatsBaseline: true,
      intervalsHonest: true,
      publishable: true,
    });
  });

  it("names the exact model version the scores belong to, since a later one is a different model", () => {
    const event = backtestScored(
      runBacktest({ series: series(), model: model({}, 4), holdoutSize: 3 }),
    );

    expect(event.payload.modelVersion).toBe(4);
  });
});

// --- Scenarios -------------------------------------------------------------------

describe("what a scenario broadcasts", () => {
  it("names the levers and the beliefs they vary, never their magnitudes", () => {
    const event = scenarioDeclared(draftScenario());

    expect(event.type).toBe(SCENARIO_DECLARED);
    expect(event.metadata.tenantId).toBe(TENANT);
    expect(event.payload).toMatchObject({
      organizationId: ORGANIZATION,
      scenarioKey: "budget.austerity.2027",
      leverKeys: ["fee.uplift"],
      leverCount: 1,
      variedAssumptionKeys: ["intake_flat"],
      overridesBaseline: false,
      version: 1,
      status: "draft",
      simulable: false,
    });
    expect(JSON.stringify(event.payload)).not.toContain("magnitude");
  });

  it("lists the levers in application order rather than the order they arrived in", () => {
    const widened = addLever(draftScenario(), {
      leverKey: "grant.loss",
      kind: "multiplicative",
      magnitude: 0.9,
    });
    const event = scenarioLeversChanged(widened);

    expect(event.type).toBe(SCENARIO_LEVERS_CHANGED);
    expect(event.payload).toMatchObject({
      leverKeys: ["grant.loss", "fee.uplift"],
      leverCount: 2,
      version: 2,
    });
  });

  it("holds the version still when only the words changed", () => {
    expect(
      scenarioAmended(amendScenario(draftScenario(), { name: "Austerity, revised" })).payload,
    ).toMatchObject({ version: 1, status: "draft" });
  });

  it("flags a scenario that discards the projection rather than moving it", () => {
    expect(
      scenarioDeclared(draftScenario({ levers: [UPLIFT, LATE_OVERRIDE] })).payload,
    ).toMatchObject({ overridesBaseline: true, leverCount: 2 });
  });

  it("says a published scenario may be run and an archived one may not", () => {
    const published = scenario();

    expect(scenarioPublished(published).type).toBe(SCENARIO_PUBLISHED);
    expect(scenarioPublished(published).payload).toMatchObject({
      status: "published",
      version: 1,
      simulable: true,
    });
    expect(scenarioArchived(archiveScenario(published)).payload).toMatchObject({
      status: "archived",
      simulable: false,
    });
  });
});

// --- Simulations -----------------------------------------------------------------

describe("what a simulation broadcasts", () => {
  it("carries the movement as a proportion, so the size of the number never travels", () => {
    const produced = simulation();
    const event = simulationRunProduced(produced);

    expect(event.type).toBe(SIMULATION_PRODUCED);
    expect(event.metadata.tenantId).toBe(TENANT);
    expect(event.payload).toMatchObject({
      simulationRunId: produced.id,
      organizationId: ORGANIZATION,
      scenarioKey: "budget.austerity.2027",
      scenarioVersion: 1,
      forecastRunId: produced.forecastRunId,
      forecastRunDigest: produced.forecastRunDigest,
      seriesKey: "attendance.rate.grade7",
      seriesVersion: 2,
      modelKey: "attendance.linear",
      modelVersion: 1,
      method: "linear_trend",
      horizon: 3,
      variedAssumptionKeys: ["intake_flat"],
      relativeTotalDelta: 0.029126,
      movedPeriodCount: 3,
      status: "completed",
      supersededByRunId: null,
    });
    expect(event.payload).not.toHaveProperty("totalBaseline");
  });

  it("inherits the baseline's grade rather than claiming one of its own", () => {
    expect(simulationRunProduced(simulation()).payload.inheritedUncertainty).toBe("tight");
  });

  it("names the levers that touched nothing, so a scenario cannot quietly do less than it says", () => {
    const partial = simulationRunProduced(simulation([UPLIFT, LATE_OVERRIDE])).payload;

    expect(partial).toMatchObject({
      unappliedLeverKeys: ["late.start"],
      fullyApplied: false,
      overridden: false,
      movedPeriodCount: 3,
    });
    expect(simulationRunProduced(simulation()).payload).toMatchObject({
      unappliedLeverKeys: [],
      fullyApplied: true,
    });
  });

  it("names the successor when a newer what-if replaced it", () => {
    const event = simulationRunSuperseded(supersedeSimulationRun(simulation(), REPLACEMENT));

    expect(event.type).toBe(SIMULATION_SUPERSEDED);
    expect(event.payload).toMatchObject({
      status: "superseded",
      supersededByRunId: REPLACEMENT,
    });
  });
});

// --- Plans -----------------------------------------------------------------------

describe("what a strategic plan broadcasts", () => {
  it("names the objectives and the metrics behind them, never their baselines or targets", () => {
    const event = planDrafted(draftPlan());

    expect(event.type).toBe(PLAN_DRAFTED);
    expect(event.metadata.tenantId).toBe(TENANT);
    expect(event.payload).toMatchObject({
      organizationId: ORGANIZATION,
      planKey: "growth.2027",
      objectiveKeys: ["attendance.rate", "chronic.absence"],
      metricKeys: ["absence.chronic", "attendance.rate"],
      objectiveCount: 2,
      startPeriod: 0,
      version: 1,
      status: "draft",
      progressCount: 0,
      reviewCount: 0,
    });
  });

  it("moves the version when the objective set changed and holds it when only the words did", () => {
    const event = planObjectivesChanged(removeObjective(draftPlan(), "chronic.absence"));

    expect(event.type).toBe(PLAN_OBJECTIVES_CHANGED);
    expect(event.payload).toMatchObject({
      objectiveKeys: ["attendance.rate"],
      objectiveCount: 1,
      version: 2,
    });
    expect(planAmended(amendPlan(activePlan(), { name: "Growth, revised" })).payload).toMatchObject(
      {
        version: 1,
        status: "active",
      },
    );
  });

  it("says the institution committed, without saying who signed it off", () => {
    const event = planActivated(activePlan());

    expect(event.type).toBe(PLAN_ACTIVATED);
    expect(event.payload).toMatchObject({ status: "active", version: 1 });
    expect(JSON.stringify(event.payload)).not.toContain(LEADER);
  });

  it("counts the readings that landed rather than repeating them", () => {
    const event = planProgressRecorded(measuredPlan());

    expect(event.payload.progressCount).toBe(2);
    expect(event.payload.reviewCount).toBe(0);
  });

  it("carries a review as counts and a headline state, and the headline is the worst of them", () => {
    const plan = reviewedPlan();
    const event = planReviewed(plan, reviewOf(plan));

    expect(event.type).toBe(PLAN_REVIEWED);
    expect(event.metadata.tenantId).toBe(TENANT);
    expect(event.payload).toMatchObject({
      planKey: "growth.2027",
      period: 6,
      planVersion: 1,
      state: "on_track",
      onTrackCount: 1,
      atRiskCount: 0,
      offTrackCount: 0,
      achievedCount: 1,
      missedCount: 0,
      unmeasuredObjectiveKeys: [],
      reviewCount: 1,
    });
  });

  it("names an objective nothing had been recorded for, because a review of a blank is not a review", () => {
    const half = reviewedPlan(
      recordProgress(activePlan(), [
        { objectiveKey: "attendance.rate", period: 6, actualValue: 96 },
      ]),
    );
    const event = planReviewed(half, reviewOf(half));

    expect(event.payload).toMatchObject({
      unmeasuredObjectiveKeys: ["chronic.absence"],
      achievedCount: 1,
      offTrackCount: 1,
      state: "off_track",
    });
  });

  it("reports a closure as its own outcome and keeps the reason off the wire", () => {
    expect(planCompleted(completePlan(reviewedPlan(), LEADER)).type).toBe(PLAN_COMPLETED);
    expect(planCompleted(completePlan(reviewedPlan(), LEADER)).payload.status).toBe("completed");

    const abandoned = planAbandoned(abandonPlan(activePlan(), LEADER, ABANDONMENT_REASON));
    expect(abandoned.type).toBe(PLAN_ABANDONED);
    expect(abandoned.payload.status).toBe("abandoned");
    expect(JSON.stringify(abandoned.payload)).not.toContain(ABANDONMENT_REASON);
  });
});

// --- The doctrine ----------------------------------------------------------------

describe("what never leaves the domain", () => {
  const everyEvent = (): readonly DomainEvent[] => {
    const history = series();
    const produced = run(history);
    const shadow = run(correctObservation(history, 3, 80));
    const published = scenario();
    const simulated = simulation();
    const reviewed = reviewedPlan();

    return [
      seriesDeclared(history),
      seriesObserved(history),
      seriesObservationCorrected(correctObservation(history, 3, 80)),
      seriesObservationWithdrawn(withdrawObservation(history, 11)),
      seriesCycleDeclared(declareCycleLength(history, 4)),
      seriesClosed(closeSeries(history)),
      seriesReopened(reopenSeries(closeSeries(history))),
      modelDrafted(draftModel()),
      modelAmended(draftModel()),
      modelPublished(model()),
      modelRetired(retireModel(model())),
      forecastRunProduced(produced),
      forecastRunSuperseded(supersedeRun(produced, REPLACEMENT)),
      forecastRunInvalidated(invalidateRun(produced, runInputs(shadow), shadow.points)),
      backtestScored(
        runBacktest({ series: history, model: model(), holdoutSize: 3, ranByUserId: ANALYST }),
      ),
      scenarioDeclared(draftScenario()),
      scenarioAmended(draftScenario()),
      scenarioLeversChanged(draftScenario()),
      scenarioPublished(published),
      scenarioArchived(archiveScenario(published)),
      simulationRunProduced(simulated),
      simulationRunSuperseded(supersedeSimulationRun(simulated, REPLACEMENT)),
      planDrafted(draftPlan()),
      planAmended(activePlan()),
      planObjectivesChanged(removeObjective(draftPlan(), "chronic.absence")),
      planActivated(activePlan()),
      planProgressRecorded(measuredPlan()),
      planReviewed(reviewed, reviewOf(reviewed)),
      planCompleted(completePlan(reviewed, LEADER)),
      planAbandoned(abandonPlan(activePlan(), LEADER, ABANDONMENT_REASON)),
    ];
  };

  /** Every number anywhere in a payload, however deeply nested. */
  const numbersIn = (value: unknown): readonly number[] => {
    if (typeof value === "number") return [value];
    if (Array.isArray(value)) return value.flatMap(numbersIn);
    if (value !== null && typeof value === "object") {
      return Object.values(value).flatMap(numbersIn);
    }
    return [];
  };

  it("puts no free text on the wire, on any event this module can produce", () => {
    const wire = JSON.stringify(everyEvent().map((event) => event.payload));
    for (const text of FREE_TEXT) {
      expect(wire).not.toContain(text);
    }
  });

  it("puts no person on the wire, on any event this module can produce", () => {
    const wire = JSON.stringify(everyEvent().map((event) => event.payload));
    for (const person of PEOPLE) {
      expect(wire).not.toContain(person);
    }
  });

  it("puts no measured or projected level on the wire, save the backtest's own scores", () => {
    const scored = everyEvent().filter((event) => event.type !== BACKTEST_SCORED);
    const numbers = new Set(numbersIn(scored.map((event) => event.payload)));
    for (const level of LEVELS) {
      expect(numbers).not.toContain(level);
    }
  });

  it("scopes every event to the tenant it happened in", () => {
    for (const event of everyEvent()) {
      expect(event.metadata.tenantId).toBe(TENANT);
    }
  });

  it("names every event under the forecast namespace", () => {
    for (const event of everyEvent()) {
      expect(event.type).toMatch(/^forecast\.[a-z_]+\.[a-z_]+$/);
    }
  });

  it("mints a distinct event id for every broadcast", () => {
    const events = everyEvent();
    const ids = new Set(events.map((event) => event.metadata.eventId));
    expect(ids.size).toBe(events.length);
  });
});
