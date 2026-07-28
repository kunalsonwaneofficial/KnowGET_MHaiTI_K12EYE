import { beforeEach, describe, expect, it } from "vitest";

import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  ForecastRunNotFoundError,
  PersonNotFoundForForecastError,
  RunNotReproducibleError,
  ScenarioNotFoundError,
  ScenarioNotPublishedError,
  SimulationRunNotFoundError,
} from "./errors";
import type { ForecastModel } from "./forecast-model";
import { draftForecastModel, publishModel } from "./forecast-model";
import type { ForecastRun } from "./forecast-run";
import { produceForecastRun, supersedeRun } from "./forecast-run";
import type { AssumptionView } from "./forecast-view";
import type { ObservationSeries } from "./observation-series";
import { declareObservationSeries, recordObservations } from "./observation-series";
import {
  InMemoryForecastRunRepository,
  InMemoryScenarioRepository,
  InMemorySimulationRunRepository,
} from "./ports";
import type { LeverInput, Scenario, ScenarioParams } from "./scenario";
import { declareScenario, publishScenario } from "./scenario";
import type { SimulationRun } from "./simulation-run";
import type { ProduceSimulationRunParams } from "./simulation-run-service";
import { SimulationRunService } from "./simulation-run-service";

const T1 = "11111111-1111-4111-8111-111111111111" as TenantId;
const T2 = "22222222-2222-4222-8222-222222222222" as TenantId;
const ORG = "33333333-3333-4333-8333-333333333333" as Uuid;
const ANALYST = "44444444-4444-4444-8444-444444444444" as Uuid;
const STRANGER = "66666666-6666-4666-8666-666666666666" as Uuid;
const MISSING = "99999999-9999-4999-8999-999999999999" as Uuid;

/** One declared belief. A forecast standing on no grounds at all is refused by the aggregate. */
const CONTINUITY: AssumptionView = {
  assumptionKey: "intake_flat",
  kind: "continuity",
  basis: "observed_history",
  holderId: null,
  reference: null,
  expectedValue: null,
};

/** A lever that moves every period, so a difference the simulation reports is a difference it made. */
const UPLIFT: LeverInput = {
  leverKey: "fee.uplift",
  kind: "multiplicative",
  magnitude: 1.05,
};

const seriesIn = (tenantId: TenantId): ObservationSeries =>
  recordObservations(
    declareObservationSeries({
      tenantId,
      organizationId: ORG,
      seriesKey: "attendance.rate.grade7",
      metricKey: "attendance.rate",
      sourceDomain: "attendance",
      grain: "month",
      direction: "higher_is_better",
    }),
    Array.from({ length: 12 }, (_, index) => ({
      period: index,
      value: 90 + index,
      label: `2026-${String(index + 1).padStart(2, "0")}`,
    })),
  );

const modelIn = (tenantId: TenantId): ForecastModel =>
  publishModel(
    draftForecastModel({
      tenantId,
      organizationId: ORG,
      modelKey: "attendance.trend",
      name: "Attendance trend",
      method: "linear_trend",
    }),
    1,
  );

const scenarioIn = (tenantId: TenantId, patch: Partial<ScenarioParams> = {}): Scenario =>
  declareScenario({
    tenantId,
    organizationId: ORG,
    scenarioKey: "austerity.case",
    name: "The austerity case",
    levers: [UPLIFT],
    ...patch,
  });

describe("SimulationRunService", () => {
  let repository: InMemorySimulationRunRepository;
  let scenarios: InMemoryScenarioRepository;
  let forecasts: InMemoryForecastRunRepository;
  let people: Set<string>;
  let published: DomainEvent[];
  let svc: SimulationRunService;
  let series: ObservationSeries;
  let model: ForecastModel;
  let forecastRun: ForecastRun;
  let scenario: Scenario;

  beforeEach(async () => {
    repository = new InMemorySimulationRunRepository();
    scenarios = new InMemoryScenarioRepository();
    forecasts = new InMemoryForecastRunRepository();
    people = new Set<string>([ANALYST]);
    published = [];
    svc = new SimulationRunService({
      repository,
      scenarios,
      forecasts,
      people: {
        async exists(_tenantId: TenantId, personId: Uuid): Promise<boolean> {
          return people.has(personId);
        },
      },
      events: {
        async publish(event: DomainEvent): Promise<void> {
          published.push(event);
        },
      },
    });

    series = seriesIn(T1);
    model = modelIn(T1);
    forecastRun = produceForecastRun({ series, model, horizon: 3, assumptions: [CONTINUITY] });
    scenario = publishScenario(scenarioIn(T1));
    await forecasts.save(forecastRun);
    await scenarios.save(scenario);
  });

  const types = (): readonly string[] => published.map((event) => event.type);

  const params = (patch: Partial<ProduceSimulationRunParams> = {}): ProduceSimulationRunParams => ({
    scenarioId: scenario.id,
    forecastRunId: forecastRun.id,
    ...patch,
  });

  /** A produced outcome with the announcement already drained. */
  const produced = async (
    patch: Partial<ProduceSimulationRunParams> = {},
  ): Promise<SimulationRun> => {
    const run = await svc.produce(T1, params(patch));
    published.length = 0;
    return run;
  };

  /** Replace the baseline with a newer forecast, exactly as the forecast service would. */
  const withdrawTheBaseline = async (): Promise<void> => {
    const replacement = produceForecastRun({
      series,
      model,
      horizon: 2,
      assumptions: [CONTINUITY],
    });
    await forecasts.save(replacement);
    await forecasts.save(supersedeRun(forecastRun, replacement.id));
  };

  // --- Running ---------------------------------------------------------------------

  describe("produce", () => {
    it("measures a published case against a standing forecast and announces the outcome", async () => {
      const run = await svc.produce(T1, params({ ranByUserId: ANALYST }));

      expect(run.status).toBe("completed");
      expect(run.points).toHaveLength(3);
      expect(run.forecastRunDigest).toBe(forecastRun.digest);
      expect(run.totalDelta).toBeGreaterThan(0);
      expect(run.unappliedLeverKeys).toEqual([]);
      expect(await repository.findById(T1, run.id)).toEqual(run);
      expect(types()).toEqual(["forecast.simulation.produced"]);
    });

    it("refuses a case whose levers can still move, writing nothing", async () => {
      const draft = scenarioIn(T1, { scenarioKey: "growth.case", name: "The growth case" });
      await scenarios.save(draft);

      // A draft's levers are editable, so an outcome citing them would misstate its own inputs.
      await expect(svc.produce(T1, params({ scenarioId: draft.id }))).rejects.toThrow(
        ScenarioNotPublishedError,
      );

      expect(await repository.listByTenant(T1)).toEqual([]);
      expect(published).toEqual([]);
    });

    it("refuses a baseline the institution has withdrawn, writing nothing", async () => {
      await withdrawTheBaseline();

      // A departure from an answer nobody stands behind is a departure from nothing.
      await expect(svc.produce(T1, params())).rejects.toThrow(RunNotReproducibleError);

      expect(await repository.listByTenant(T1)).toEqual([]);
      expect(published).toEqual([]);
    });

    it("refuses a scenario that is not there, writing nothing", async () => {
      await expect(svc.produce(T1, params({ scenarioId: MISSING }))).rejects.toThrow(
        ScenarioNotFoundError,
      );

      expect(await repository.listByTenant(T1)).toEqual([]);
    });

    it("refuses a baseline that is not there, writing nothing", async () => {
      await expect(svc.produce(T1, params({ forecastRunId: MISSING }))).rejects.toThrow(
        ForecastRunNotFoundError,
      );

      expect(await repository.listByTenant(T1)).toEqual([]);
    });

    it("refuses a runner who is not a person, writing nothing", async () => {
      await expect(svc.produce(T1, params({ ranByUserId: STRANGER }))).rejects.toThrow(
        PersonNotFoundForForecastError,
      );

      expect(await repository.listByTenant(T1)).toEqual([]);
      expect(published).toEqual([]);
    });
  });

  // --- Supersession ----------------------------------------------------------------

  describe("supersede", () => {
    it("points a retired outcome at the one that replaced it", async () => {
      const first = await produced();
      const replacement = await produced();

      const next = await svc.supersede(T1, first.id, replacement.id);

      expect(next.status).toBe("superseded");
      expect(next.supersededByRunId).toBe(replacement.id);
      expect(next.points).toEqual(first.points);
      expect(types()).toEqual(["forecast.simulation.superseded"]);
    });

    it("refuses a replacement that is not there, leaving the outcome current", async () => {
      const first = await produced();

      await expect(svc.supersede(T1, first.id, MISSING)).rejects.toThrow(
        SimulationRunNotFoundError,
      );

      expect((await repository.findById(T1, first.id))?.status).toBe("completed");
      expect(published).toEqual([]);
    });
  });

  // --- Reading ---------------------------------------------------------------------

  describe("reads", () => {
    it("finds an outcome by id, by scenario, by baseline and across the tenant", async () => {
      const run = await produced();

      expect(await svc.get(T1, run.id)).toEqual(run);
      expect(await svc.findCurrentForScenario(T1, scenario.id)).toEqual(run);
      expect(await svc.listByScenario(T1, scenario.id)).toEqual([run]);
      expect(await svc.listStandingOn(T1, forecastRun.id)).toEqual([run]);
      expect(await svc.list(T1)).toEqual([run]);
    });

    it("still finds what a withdrawn baseline put in question", async () => {
      const run = await produced();

      await withdrawTheBaseline();

      // The outcome records which forecast it departed from and nothing records the reverse, so this
      // read is the only way to find the simulations a withdrawal has just called into doubt.
      expect(await svc.listStandingOn(T1, forecastRun.id)).toEqual([run]);
      expect(await repository.findById(T1, run.id)).toEqual(run);
    });

    it("keeps an outcome out of another tenant's reach", async () => {
      const run = await produced();

      await expect(svc.get(T2, run.id)).rejects.toThrow(SimulationRunNotFoundError);
      expect(await svc.list(T2)).toEqual([]);
      expect(await svc.listStandingOn(T2, forecastRun.id)).toEqual([]);
    });

    it("404s on an outcome that is not there", async () => {
      await expect(svc.get(T1, MISSING)).rejects.toThrow(SimulationRunNotFoundError);
    });
  });

  // --- Without a bus ---------------------------------------------------------------

  it("works without an event bus", async () => {
    const quiet = new SimulationRunService({
      repository,
      scenarios,
      forecasts,
      people: {
        async exists(): Promise<boolean> {
          return true;
        },
      },
    });

    const run = await quiet.produce(T1, params());

    expect(await repository.findById(T1, run.id)).toEqual(run);
    expect(published).toEqual([]);
  });
});
