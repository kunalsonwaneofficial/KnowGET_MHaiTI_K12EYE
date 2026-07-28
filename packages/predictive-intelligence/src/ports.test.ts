import { describe, expect, it } from "vitest";

import type { TenantId, Uuid } from "@knowget/types";
import type { Backtest } from "./backtest";
import { runBacktest } from "./backtest";
import type { ForecastModel } from "./forecast-model";
import { draftForecastModel, publishModel, reviseModel } from "./forecast-model";
import type { ForecastRun } from "./forecast-run";
import { produceForecastRun, supersedeRun } from "./forecast-run";
import type { AssumptionView } from "./forecast-view";
import type { ObservationSeries } from "./observation-series";
import { declareObservationSeries, recordObservations } from "./observation-series";
import {
  InMemoryBacktestRepository,
  InMemoryForecastModelRepository,
  InMemoryForecastRunRepository,
  InMemoryObservationSeriesRepository,
  InMemoryScenarioRepository,
  InMemorySimulationRunRepository,
  InMemoryStrategicPlanRepository,
} from "./ports";
import type { Scenario } from "./scenario";
import { declareScenario, publishScenario } from "./scenario";
import type { SimulationRun } from "./simulation-run";
import { produceSimulationRun } from "./simulation-run";
import type { StrategicPlan } from "./strategic-plan";
import { activatePlan, draftStrategicPlan } from "./strategic-plan";

const T1 = "11111111-1111-4111-8111-111111111111" as TenantId;
const T2 = "22222222-2222-4222-8222-222222222222" as TenantId;
const ORG = "33333333-3333-4333-8333-333333333333" as Uuid;
const OTHER_ORG = "44444444-4444-4444-8444-444444444444" as Uuid;
const ANALYST = "55555555-5555-4555-8555-555555555555" as Uuid;
const REPLACEMENT = "66666666-6666-4666-8666-666666666666" as Uuid;

// --- Fixtures --------------------------------------------------------------------

const seriesIn = (
  tenantId: TenantId,
  seriesKey = "attendance.rate.grade7",
  overrides: { metricKey?: string; subjectRef?: string | null; organizationId?: Uuid } = {},
): ObservationSeries =>
  recordObservations(
    declareObservationSeries({
      tenantId,
      organizationId: overrides.organizationId ?? ORG,
      seriesKey,
      metricKey: overrides.metricKey ?? "attendance.rate",
      sourceDomain: "attendance",
      subjectRef: overrides.subjectRef ?? null,
      grain: "month",
      direction: "higher_is_better",
    }),
    Array.from({ length: 12 }, (_, index) => ({
      period: index,
      value: 90 + index,
      label: `2026-${String(index + 1).padStart(2, "0")}`,
    })),
  );

const modelIn = (tenantId: TenantId, modelKey = "attendance.linear", version = 1): ForecastModel =>
  publishModel(
    draftForecastModel({
      tenantId,
      organizationId: ORG,
      modelKey,
      name: "Attendance linear trend",
      method: "linear_trend",
    }),
    version,
  );

const CONTINUITY: AssumptionView = {
  assumptionKey: "intake_flat",
  kind: "continuity",
  basis: "observed_history",
  holderId: null,
  reference: null,
  expectedValue: null,
};

const runIn = (
  tenantId: TenantId,
  series = seriesIn(tenantId),
  model = modelIn(tenantId),
  horizon = 3,
): ForecastRun =>
  produceForecastRun({
    series,
    model,
    horizon,
    assumptions: [CONTINUITY],
    producedByUserId: ANALYST,
  });

const backtestIn = (
  tenantId: TenantId,
  series = seriesIn(tenantId),
  model = modelIn(tenantId),
): Backtest => runBacktest({ series, model, holdoutSize: 3, ranByUserId: ANALYST });

const scenarioIn = (tenantId: TenantId, scenarioKey = "austerity.2027"): Scenario =>
  publishScenario(
    declareScenario({
      tenantId,
      organizationId: ORG,
      scenarioKey,
      name: "Austerity case 2027",
      levers: [{ leverKey: "fee.uplift", kind: "additive", magnitude: 3 }],
    }),
  );

const simulationIn = (
  tenantId: TenantId,
  scenario = scenarioIn(tenantId),
  forecastRun = runIn(tenantId),
): SimulationRun => produceSimulationRun({ scenario, forecastRun, ranByUserId: ANALYST });

const planIn = (
  tenantId: TenantId,
  planKey = "growth.2027",
  metricKey = "attendance.rate",
): StrategicPlan =>
  draftStrategicPlan({
    tenantId,
    organizationId: ORG,
    planKey,
    name: "Growth 2027",
    startPeriod: 0,
    objectives: [
      {
        objectiveKey: "attendance.rate",
        metricKey,
        direction: "higher_is_better",
        baselineValue: 90,
        targetValue: 96,
        targetPeriod: 12,
      },
    ],
  });

// --- Tenant isolation ------------------------------------------------------------

/**
 * Every read filters on the tenant it was given, including the ones that look like they could not leak.
 *
 * A forecast digest is the sharpest case. It is a hash of the pinned inputs, so two tenants running the same
 * method over the same figures produce the same digest — and a `findByDigest` that trusted the hash to be
 * unique would hand one institution's forecast to another on a collision that is not an accident but the
 * whole point of a digest.
 */
describe("in-memory ports: tenant isolation", () => {
  it("keeps series inside their tenant, by id, key, metric and subject", async () => {
    const repository = new InMemoryObservationSeriesRepository();
    const mine = seriesIn(T1, "attendance.rate.grade7", { subjectRef: "grade-7" });
    const theirs = seriesIn(T2, "attendance.rate.grade7", { subjectRef: "grade-7" });
    await repository.save(mine);
    await repository.save(theirs);

    expect(await repository.findById(T1, mine.id)).toEqual(mine);
    expect(await repository.findById(T1, theirs.id)).toBeNull();
    expect(await repository.findByKey(T1, ORG, "attendance.rate.grade7")).toEqual(mine);
    expect(await repository.listByMetric(T1, "attendance.rate")).toEqual([mine]);
    expect(await repository.listBySubject(T1, "attendance", "grade-7")).toEqual([mine]);
    expect(await repository.listByTenant(T2)).toEqual([theirs]);
  });

  it("keeps models inside their tenant, by id, key and version", async () => {
    const repository = new InMemoryForecastModelRepository();
    const mine = modelIn(T1);
    const theirs = modelIn(T2);
    await repository.save(mine);
    await repository.save(theirs);

    expect(await repository.findById(T1, theirs.id)).toBeNull();
    expect(await repository.findByKeyAndVersion(T1, "attendance.linear", 1)).toEqual(mine);
    expect(await repository.findPublishedByKey(T2, "attendance.linear")).toEqual(theirs);
    expect(await repository.listVersionsOfKey(T1, "attendance.linear")).toEqual([mine]);
    expect(await repository.listPublished(T1)).toEqual([mine]);
  });

  it("keeps runs inside their tenant, even when two tenants produce the same digest", async () => {
    const repository = new InMemoryForecastRunRepository();
    const mine = runIn(T1);
    const theirs = runIn(T2);
    await repository.save(mine);
    await repository.save(theirs);

    expect(mine.digest).toBe(theirs.digest);
    expect(await repository.findByDigest(T1, mine.digest)).toEqual(mine);
    expect(await repository.findByDigest(T2, mine.digest)).toEqual(theirs);
    expect(await repository.findById(T1, theirs.id)).toBeNull();
  });

  it("keeps backtests inside their tenant, by id, series and model", async () => {
    const repository = new InMemoryBacktestRepository();
    const mine = backtestIn(T1);
    const theirs = backtestIn(T2);
    await repository.save(mine);
    await repository.save(theirs);

    expect(await repository.findById(T1, theirs.id)).toBeNull();
    expect(await repository.listByModel(T1, mine.modelId)).toEqual([mine]);
    expect(await repository.listBySeries(T2, theirs.seriesId)).toEqual([theirs]);
    expect(await repository.findLatestForPair(T2, mine.seriesId, mine.modelId)).toBeNull();
  });

  it("keeps scenarios inside their tenant, by id, key and organization", async () => {
    const repository = new InMemoryScenarioRepository();
    const mine = scenarioIn(T1);
    const theirs = scenarioIn(T2);
    await repository.save(mine);
    await repository.save(theirs);

    expect(await repository.findById(T1, theirs.id)).toBeNull();
    expect(await repository.findByKey(T1, ORG, "austerity.2027")).toEqual(mine);
    expect(await repository.listByOrganization(T1, ORG)).toEqual([mine]);
    expect(await repository.listPublished(T2)).toEqual([theirs]);
  });

  it("keeps simulations inside their tenant, by scenario and by baseline run", async () => {
    const repository = new InMemorySimulationRunRepository();
    const mine = simulationIn(T1);
    const theirs = simulationIn(T2);
    await repository.save(mine);
    await repository.save(theirs);

    expect(await repository.findById(T1, theirs.id)).toBeNull();
    expect(await repository.listByScenario(T1, mine.scenarioId)).toEqual([mine]);
    expect(await repository.listByForecastRun(T2, theirs.forecastRunId)).toEqual([theirs]);
    expect(await repository.findLatestForScenario(T2, mine.scenarioId)).toBeNull();
  });

  it("keeps plans inside their tenant, by id, key, metric and organization", async () => {
    const repository = new InMemoryStrategicPlanRepository();
    const mine = activatePlan(planIn(T1), ANALYST);
    const theirs = activatePlan(planIn(T2), ANALYST);
    await repository.save(mine);
    await repository.save(theirs);

    expect(await repository.findById(T1, theirs.id)).toBeNull();
    expect(await repository.findByKey(T1, ORG, "growth.2027")).toEqual(mine);
    expect(await repository.listActive(T1)).toEqual([mine]);
    expect(await repository.listByMetric(T1, "attendance.rate")).toEqual([mine]);
    expect(await repository.listByOrganization(T2, ORG)).toEqual([theirs]);
  });

  it("saves by id, so writing a moved aggregate replaces it rather than duplicating it", async () => {
    const repository = new InMemoryForecastRunRepository();
    const run = runIn(T1);
    await repository.save(run);
    await repository.save(supersedeRun(run, REPLACEMENT));

    const stored = await repository.listByTenant(T1);
    expect(stored).toHaveLength(1);
    expect(stored.map((r) => r.status)).toEqual(["superseded"]);
  });
});

// --- Resolving a model version ---------------------------------------------------

/**
 * A model key names a lineage, not a row. Runs pin a version and hash it into their digest, so a published
 * model can never be edited — a revision is a new draft beside the published one, and both are findable
 * because they answer different questions.
 */
describe("in-memory ports: resolving a model version", () => {
  it("separates the version that may be pinned from the one being written", async () => {
    const repository = new InMemoryForecastModelRepository();
    const published = modelIn(T1);
    const draft = reviseModel(published, { name: "Attendance linear trend, revised" });
    await repository.save(published);
    await repository.save(draft);

    expect(await repository.findPublishedByKey(T1, "attendance.linear")).toEqual(published);
    expect(await repository.listPublished(T1)).toEqual([published]);
    expect(await repository.listVersionsOfKey(T1, "attendance.linear")).toHaveLength(2);
  });

  it("reports nothing rather than a draft when no version has been published", async () => {
    const repository = new InMemoryForecastModelRepository();
    await repository.save(
      draftForecastModel({
        tenantId: T1,
        organizationId: ORG,
        modelKey: "attendance.linear",
        name: "Attendance linear trend",
        method: "linear_trend",
      }),
    );

    expect(await repository.findPublishedByKey(T1, "attendance.linear")).toBeNull();
    expect(await repository.listPublished(T1)).toEqual([]);
    expect(await repository.listVersionsOfKey(T1, "attendance.linear")).toHaveLength(1);
  });

  it("finds a single row for a key and version, which is what the version guard reads", async () => {
    const repository = new InMemoryForecastModelRepository();
    await repository.save(modelIn(T1, "attendance.linear", 1));
    await repository.save(modelIn(T1, "attendance.linear", 2));

    const taken = await repository.listVersionsOfKey(T1, "attendance.linear");
    expect(taken.map((m) => m.version).sort()).toEqual([1, 2]);
    expect(await repository.findByKeyAndVersion(T1, "attendance.linear", 2)).not.toBeNull();
    expect(await repository.findByKeyAndVersion(T1, "attendance.linear", 3)).toBeNull();
  });
});

// --- Finding the forecast behind a claim -----------------------------------------

/**
 * The contract's fourth rule is that a forecast is reproducible, and these are the reads that make it
 * answerable rather than merely true. A digest identifies a computation; a series and a model each identify
 * a set of runs that a correction or a retirement puts in question.
 */
describe("in-memory ports: finding the forecast behind a claim", () => {
  it("finds a run by the digest of its own inputs", async () => {
    const repository = new InMemoryForecastRunRepository();
    const run = runIn(T1);
    await repository.save(run);

    expect(await repository.findByDigest(T1, run.digest)).toEqual(run);
    expect(await repository.findByDigest(T1, "0".repeat(64))).toBeNull();
  });

  it("offers the current run for a series, and counts superseded ones out of it", async () => {
    const repository = new InMemoryForecastRunRepository();
    const series = seriesIn(T1);
    const model = modelIn(T1);
    const first = runIn(T1, series, model, 3);
    const second = runIn(T1, series, model, 6);
    await repository.save(supersedeRun(first, second.id));
    await repository.save(second);

    expect(await repository.findLatestForSeries(T1, series.id)).toEqual(second);
    expect(await repository.listBySeries(T1, series.id)).toHaveLength(2);
  });

  it("reports no current run for a series whose only run was superseded", async () => {
    const repository = new InMemoryForecastRunRepository();
    const series = seriesIn(T1);
    const run = runIn(T1, series);
    await repository.save(supersedeRun(run, REPLACEMENT));

    expect(await repository.findLatestForSeries(T1, series.id)).toBeNull();
    expect(await repository.listBySeries(T1, series.id)).toHaveLength(1);
  });

  it("lists every run pinned to a model, which is what a retirement puts in question", async () => {
    const repository = new InMemoryForecastRunRepository();
    const model = modelIn(T1);
    await repository.save(runIn(T1, seriesIn(T1, "attendance.rate.grade7"), model));
    await repository.save(runIn(T1, seriesIn(T1, "attendance.rate.grade8"), model));
    await repository.save(runIn(T1, seriesIn(T1, "attendance.rate.grade9"), modelIn(T1, "other")));

    expect(await repository.listByModel(T1, model.id)).toHaveLength(2);
  });

  it("offers the latest score for one series and model, which is what gates publication", async () => {
    const repository = new InMemoryBacktestRepository();
    const series = seriesIn(T1);
    const model = modelIn(T1);
    const earlier = backtestIn(T1, series, model);
    const later = backtestIn(T1, series, model);
    await repository.save(earlier);
    await repository.save(later);

    expect(await repository.findLatestForPair(T1, series.id, model.id)).toEqual(later);
    expect(await repository.findLatestForPair(T1, series.id, modelIn(T1, "other").id)).toBeNull();
  });
});

// --- What a change puts in question ----------------------------------------------

/**
 * Nothing in this domain stands alone. A corrected series moves every run pinned to it; a superseded run
 * moves every simulation standing on it; and a metric that stops meaning what it meant moves every plan
 * measured against it. Each of those is a set somebody has to be able to find, and finding it is a read
 * rather than a search through everything.
 */
describe("in-memory ports: what a change puts in question", () => {
  it("finds every simulation standing on one baseline run", async () => {
    const repository = new InMemorySimulationRunRepository();
    const baseline = runIn(T1);
    const austerity = scenarioIn(T1, "austerity.2027");
    const growth = scenarioIn(T1, "growth.2027");
    await repository.save(simulationIn(T1, austerity, baseline));
    await repository.save(simulationIn(T1, growth, baseline));
    await repository.save(simulationIn(T1, austerity, runIn(T1, seriesIn(T1, "other.series"))));

    expect(await repository.listByForecastRun(T1, baseline.id)).toHaveLength(2);
  });

  it("finds the current exploration of a scenario", async () => {
    const repository = new InMemorySimulationRunRepository();
    const scenario = scenarioIn(T1);
    const earlier = simulationIn(T1, scenario);
    const later = simulationIn(T1, scenario);
    await repository.save(earlier);
    await repository.save(later);

    expect(await repository.findLatestForScenario(T1, scenario.id)).toEqual(later);
  });

  it("finds every series measuring one metric, however many subjects it is measured across", async () => {
    const repository = new InMemoryObservationSeriesRepository();
    await repository.save(seriesIn(T1, "attendance.rate.grade7", { subjectRef: "grade-7" }));
    await repository.save(seriesIn(T1, "attendance.rate.grade8", { subjectRef: "grade-8" }));
    await repository.save(
      seriesIn(T1, "absence.chronic.grade7", {
        metricKey: "absence.chronic",
        subjectRef: "grade-7",
      }),
    );

    expect(await repository.listByMetric(T1, "attendance.rate")).toHaveLength(2);
    expect(await repository.listBySubject(T1, "attendance", "grade-7")).toHaveLength(2);
  });

  it("finds every plan whose objectives depend on one metric", async () => {
    const repository = new InMemoryStrategicPlanRepository();
    await repository.save(planIn(T1, "growth.2027", "attendance.rate"));
    await repository.save(planIn(T1, "recovery.2028", "attendance.rate"));
    await repository.save(planIn(T1, "wellbeing.2027", "absence.chronic"));

    expect(await repository.listByMetric(T1, "attendance.rate")).toHaveLength(2);
    expect(await repository.listByMetric(T1, "absence.chronic")).toHaveLength(1);
    expect(await repository.listByMetric(T1, "fees.collected")).toEqual([]);
  });

  it("separates one organization's scenarios and plans from another's inside a tenant", async () => {
    const scenarios = new InMemoryScenarioRepository();
    const plans = new InMemoryStrategicPlanRepository();
    await scenarios.save(scenarioIn(T1));
    await plans.save(planIn(T1));

    expect(await scenarios.listByOrganization(T1, OTHER_ORG)).toEqual([]);
    expect(await plans.listByOrganization(T1, OTHER_ORG)).toEqual([]);
    expect(await scenarios.listByOrganization(T1, ORG)).toHaveLength(1);
    expect(await plans.listByOrganization(T1, ORG)).toHaveLength(1);
  });
});

// --- What has no delete path -----------------------------------------------------

/**
 * Five of the seven repositories have no `remove`, and that is a design position rather than an omission.
 *
 * A series is the measured history. A run is what was projected, a backtest what a model actually scored, a
 * simulation what a scenario was found to do, and a plan what an institution committed to. None of the five
 * is a draft, and a forecasting domain whose unflattering records can be deleted is one whose flattering ones
 * mean nothing. A delete path that does not exist cannot be reached by mistake.
 */
describe("in-memory ports: what cannot be deleted", () => {
  it("offers no way to delete a series, a run, a backtest, a simulation or a plan", () => {
    expect("remove" in new InMemoryObservationSeriesRepository()).toBe(false);
    expect("remove" in new InMemoryForecastRunRepository()).toBe(false);
    expect("remove" in new InMemoryBacktestRepository()).toBe(false);
    expect("remove" in new InMemorySimulationRunRepository()).toBe(false);
    expect("remove" in new InMemoryStrategicPlanRepository()).toBe(false);
  });

  it("offers one for the definitions an institution maintains", () => {
    expect(typeof new InMemoryForecastModelRepository().remove).toBe("function");
    expect(typeof new InMemoryScenarioRepository().remove).toBe("function");
  });

  it("refuses to remove another tenant's model or scenario", async () => {
    const models = new InMemoryForecastModelRepository();
    const scenarios = new InMemoryScenarioRepository();
    const model = modelIn(T1);
    const scenario = scenarioIn(T1);
    await models.save(model);
    await scenarios.save(scenario);

    await models.remove(T2, model.id);
    await scenarios.remove(T2, scenario.id);
    expect(await models.findById(T1, model.id)).toEqual(model);
    expect(await scenarios.findById(T1, scenario.id)).toEqual(scenario);

    await models.remove(T1, model.id);
    await scenarios.remove(T1, scenario.id);
    expect(await models.findById(T1, model.id)).toBeNull();
    expect(await scenarios.findById(T1, scenario.id)).toBeNull();
  });
});
