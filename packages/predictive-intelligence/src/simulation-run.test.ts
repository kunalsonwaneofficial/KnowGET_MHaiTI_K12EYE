import { describe, expect, it } from "vitest";

import type { TenantId, Uuid } from "@knowget/types";
import {
  InvalidSimulationTransitionError,
  RunNotReproducibleError,
  ScenarioNotPublishedError,
} from "./errors";
import type { ForecastModel } from "./forecast-model";
import { draftForecastModel, publishModel } from "./forecast-model";
import type { ForecastRun } from "./forecast-run";
import { produceForecastRun, supersedeRun } from "./forecast-run";
import type { AssumptionView } from "./forecast-view";
import type { ObservationSeries } from "./observation-series";
import { declareObservationSeries, recordObservations } from "./observation-series";
import type { LeverInput, Scenario, ScenarioParams } from "./scenario";
import { archiveScenario, declareScenario, publishScenario } from "./scenario";
import { simulate } from "./simulation";
import type { SimulationRun, SimulationRunParams } from "./simulation-run";
import {
  fullyApplied,
  isSimulationCurrent,
  movedPeriods,
  produceSimulationRun,
  relativeTotalDelta,
  simulationOutcome,
  simulationPointAtHorizon,
  simulationReference,
  supersedeSimulationRun,
} from "./simulation-run";

const TENANT = "11111111-1111-4111-8111-111111111111" as TenantId;
const ORGANIZATION = "22222222-2222-4222-8222-222222222222" as Uuid;
const REPLACEMENT = "33333333-3333-4333-8333-333333333333" as Uuid;
const ANALYST = "44444444-4444-4444-8444-444444444444" as Uuid;

/**
 * A history whose forecast is checkable by hand.
 *
 * `linear_trend` fits a straight line exactly, so a series of `90 + period` over periods 0–11 projects 102, 103
 * and 104 at horizons 1–3 — a baseline totalling 309. Every scenario figure below is that arithmetic plus a
 * lever, which is what lets these tests assert exact numbers rather than approximate ones.
 */
const seriesOf = (values: readonly number[]): ObservationSeries =>
  recordObservations(
    declareObservationSeries({
      tenantId: TENANT,
      organizationId: ORGANIZATION,
      seriesKey: "attendance.rate.grade7",
      metricKey: "attendance.rate",
      sourceDomain: "attendance",
      grain: "month",
      direction: "higher_is_better",
    }),
    values.map((value, index) => ({
      period: index,
      value,
      label: `2026-${String(index + 1).padStart(2, "0")}`,
    })),
  );

const series = (): ObservationSeries => seriesOf(Array.from({ length: 12 }, (_, i) => 90 + i));

/** A history projecting to −1, 0 and 1: a baseline totalling zero, and graded `unusable` for its flatness. */
const zeroSumSeries = (): ObservationSeries =>
  seriesOf(Array.from({ length: 12 }, (_, i) => i - 13));

const model = (): ForecastModel =>
  publishModel(
    draftForecastModel({
      tenantId: TENANT,
      organizationId: ORGANIZATION,
      modelKey: "attendance.linear",
      name: "Attendance linear trend",
      method: "linear_trend",
    }),
    1,
  );

const CONTINUITY: AssumptionView = {
  assumptionKey: "intake_flat",
  kind: "continuity",
  basis: "observed_history",
  holderId: null,
  reference: null,
  expectedValue: null,
};

const baseline = (history: ObservationSeries = series()): ForecastRun =>
  produceForecastRun({
    series: history,
    model: model(),
    horizon: 3,
    assumptions: [CONTINUITY],
  });

const lever = (overrides: Partial<LeverInput> = {}): LeverInput => ({
  leverKey: "fee.uplift",
  kind: "additive",
  magnitude: 10,
  ...overrides,
});

const declared = (
  levers: readonly LeverInput[] = [lever()],
  overrides: Partial<ScenarioParams> = {},
): Scenario =>
  declareScenario({
    tenantId: TENANT,
    organizationId: ORGANIZATION,
    scenarioKey: "budget.austerity.2027",
    name: "Austerity case 2027",
    levers,
    ...overrides,
  });

const scenario = (
  levers: readonly LeverInput[] = [lever()],
  overrides: Partial<ScenarioParams> = {},
): Scenario => publishScenario(declared(levers, overrides));

const run = (overrides: Partial<SimulationRunParams> = {}): SimulationRun =>
  produceSimulationRun({ scenario: scenario(), forecastRun: baseline(), ...overrides });

describe("produceSimulationRun", () => {
  it("produces a completed run covering every baseline period", () => {
    const produced = run();
    expect(produced.status).toBe("completed");
    expect(produced.points.map((point) => point.period)).toEqual([12, 13, 14]);
    expect(produced.supersededByRunId).toBeNull();
    expect(produced.supersededAt).toBeNull();
  });

  it("pins the scenario, the lever-set version and the levers themselves", () => {
    const configured = scenario();
    const produced = run({ scenario: configured });
    expect(produced.scenarioId).toBe(configured.id);
    expect(produced.scenarioKey).toBe("budget.austerity.2027");
    expect(produced.scenarioVersion).toBe(configured.version);
    expect(produced.levers).toEqual(configured.levers);
  });

  it("pins the baseline run and the digest that identifies its inputs", () => {
    const base = baseline();
    const produced = run({ forecastRun: base });
    expect(produced.forecastRunId).toBe(base.id);
    expect(produced.forecastRunDigest).toBe(base.digest);
  });

  it("carries the baseline's series, model and method forward for reading without a join", () => {
    const base = baseline();
    const produced = run({ forecastRun: base });
    expect(produced.seriesKey).toBe(base.seriesKey);
    expect(produced.seriesVersion).toBe(base.seriesVersion);
    expect(produced.modelKey).toBe(base.modelKey);
    expect(produced.modelVersion).toBe(base.modelVersion);
    expect(produced.method).toBe("linear_trend");
    expect(produced.horizon).toBe(3);
  });

  it("takes the tenant and organization from the scenario rather than the baseline", () => {
    const elsewhere = "55555555-5555-4555-8555-555555555555" as Uuid;
    const produced = run({ scenario: scenario([lever()], { organizationId: elsewhere }) });
    expect(produced.tenantId).toBe(TENANT);
    expect(produced.organizationId).toBe(elsewhere);
  });

  it("carries the baseline value beside every scenario value", () => {
    const base = baseline();
    const produced = run({ forecastRun: base });
    expect(produced.points.map((point) => point.baselineValue)).toEqual([102, 103, 104]);
    expect(produced.points.map((point) => point.label)).toEqual(
      base.points.map((point) => point.label),
    );
  });

  it("applies an additive lever across the whole projection", () => {
    const produced = run();
    expect(produced.points.map((point) => point.scenarioValue)).toEqual([112, 113, 114]);
    expect(produced.points.map((point) => point.delta)).toEqual([10, 10, 10]);
    expect(produced.points.map((point) => point.appliedLeverKeys)).toEqual([
      ["fee.uplift"],
      ["fee.uplift"],
      ["fee.uplift"],
    ]);
  });

  it("records the totals and the largest single-period movement", () => {
    const produced = run();
    expect(produced.totalBaseline).toBe(309);
    expect(produced.totalScenario).toBe(339);
    expect(produced.totalDelta).toBe(30);
    expect(produced.peakDelta).toBe(10);
  });

  it("honours a lever that starts partway through the projection", () => {
    const produced = run({ scenario: scenario([lever({ fromHorizon: 2 })]) });
    expect(produced.points.map((point) => point.delta)).toEqual([0, 10, 10]);
    expect(produced.totalScenario).toBe(329);
    expect(produced.totalDelta).toBe(20);
  });

  it("inherits the baseline's uncertainty grade rather than deriving one", () => {
    const base = baseline();
    const produced = run({ forecastRun: base });
    expect(produced.inheritedUncertainty).toBe(base.uncertainty.grade);
    expect(produced.inheritedUncertainty).toBe("tight");
  });

  it("inherits an unusable grade unchanged, however tidy the scenario looks", () => {
    const base = baseline(zeroSumSeries());
    const produced = run({ forecastRun: base });
    expect(base.uncertainty.grade).toBe("unusable");
    expect(produced.inheritedUncertainty).toBe("unusable");
    expect(produced.points.map((point) => point.scenarioValue)).toEqual([9, 10, 11]);
  });

  it("records the distinct beliefs the scenario's levers vary, in application order", () => {
    const produced = run({
      scenario: scenario([
        lever({ leverKey: "fee.uplift", assumptionKey: "fee.uplift" }),
        lever({
          leverKey: "enrolment.growth",
          kind: "growth_rate",
          magnitude: 1.02,
          assumptionKey: "enrolment.trend",
        }),
        lever({ leverKey: "grant.windfall", magnitude: 5 }),
      ]),
    });
    expect(produced.variedAssumptionKeys).toEqual(["enrolment.trend", "fee.uplift"]);
  });

  it("flags a run where an override discarded the projection", () => {
    const plain = run();
    const overridden = run({
      scenario: scenario([lever({ leverKey: "grant.fixed", kind: "override", magnitude: 200 })]),
    });
    expect(plain.overridden).toBe(false);
    expect(overridden.overridden).toBe(true);
    expect(overridden.points.map((point) => point.scenarioValue)).toEqual([200, 200, 200]);
  });

  it("records a lever that reached nothing instead of refusing the run", () => {
    const produced = run({
      scenario: scenario([lever(), lever({ leverKey: "late.cut", fromHorizon: 9 })]),
    });
    expect(produced.unappliedLeverKeys).toEqual(["late.cut"]);
    expect(produced.totalDelta).toBe(30);
  });

  it("records who ran it, and defaults to nobody", () => {
    expect(run().ranByUserId).toBeNull();
    expect(run({ ranByUserId: ANALYST }).ranByUserId).toBe(ANALYST);
  });

  it("stamps the run, its creation and its last change together", () => {
    const produced = run();
    expect(produced.ranAt).toBe(produced.createdAt);
    expect(produced.updatedAt).toBe(produced.createdAt);
  });
});

describe("what a run refuses", () => {
  it("refuses a scenario whose levers can still move", () => {
    expect(() => run({ scenario: declared() })).toThrow(ScenarioNotPublishedError);
  });

  it("refuses a scenario the institution has retired", () => {
    expect(() => run({ scenario: archiveScenario(scenario()) })).toThrow(ScenarioNotPublishedError);
  });

  it("refuses a baseline the institution has already replaced", () => {
    expect(() => run({ forecastRun: supersedeRun(baseline(), REPLACEMENT) })).toThrow(
      RunNotReproducibleError,
    );
  });

  it("refuses before computing anything, leaving no partial record", () => {
    expect(() =>
      produceSimulationRun({
        scenario: declared(),
        forecastRun: supersedeRun(baseline(), REPLACEMENT),
      }),
    ).toThrow(ScenarioNotPublishedError);
  });
});

describe("supersedeSimulationRun", () => {
  it("records which run replaced it", () => {
    const superseded = supersedeSimulationRun(run(), REPLACEMENT);
    expect(superseded.status).toBe("superseded");
    expect(superseded.supersededByRunId).toBe(REPLACEMENT);
    expect(superseded.supersededAt).not.toBeNull();
  });

  it("leaves the outcome exactly as it was computed", () => {
    const produced = run();
    const superseded = supersedeSimulationRun(produced, REPLACEMENT);
    expect(superseded.points).toEqual(produced.points);
    expect(superseded.totalDelta).toBe(produced.totalDelta);
    expect(superseded.inheritedUncertainty).toBe(produced.inheritedUncertainty);
  });

  it("does not change what the run was a simulation of", () => {
    const produced = run();
    const superseded = supersedeSimulationRun(produced, REPLACEMENT);
    expect(superseded.scenarioVersion).toBe(produced.scenarioVersion);
    expect(superseded.forecastRunDigest).toBe(produced.forecastRunDigest);
    expect(superseded.createdAt).toBe(produced.createdAt);
  });

  it("refuses to be superseded twice", () => {
    expect(() =>
      supersedeSimulationRun(supersedeSimulationRun(run(), REPLACEMENT), REPLACEMENT),
    ).toThrow(InvalidSimulationTransitionError);
  });
});

describe("reading", () => {
  it("reassembles the outcome exactly as the engine produced it", () => {
    const configured = scenario();
    const base = baseline();
    const produced = produceSimulationRun({ scenario: configured, forecastRun: base });
    expect(simulationOutcome(produced)).toEqual(
      simulate(configured.scenarioKey, base.points, configured.levers, base.uncertainty.grade),
    );
  });

  it("finds the simulated period at a horizon", () => {
    const point = simulationPointAtHorizon(run(), 2);
    expect(point?.period).toBe(13);
    expect(point?.scenarioValue).toBe(113);
  });

  it("returns nothing past the end of the projection", () => {
    expect(simulationPointAtHorizon(run(), 4)).toBeNull();
  });

  it("is current until it is superseded", () => {
    const produced = run();
    expect(isSimulationCurrent(produced)).toBe(true);
    expect(isSimulationCurrent(supersedeSimulationRun(produced, REPLACEMENT))).toBe(false);
  });

  it("reports a configuration where every lever reached a period", () => {
    expect(fullyApplied(run())).toBe(true);
  });

  it("reports a configuration where a lever reached nothing", () => {
    const produced = run({
      scenario: scenario([lever(), lever({ leverKey: "late.cut", fromHorizon: 9 })]),
    });
    expect(fullyApplied(produced)).toBe(false);
  });

  it("names only the periods the scenario actually moved", () => {
    expect(movedPeriods(run())).toEqual([12, 13, 14]);
    expect(movedPeriods(run({ scenario: scenario([lever({ fromHorizon: 3 })]) }))).toEqual([14]);
  });

  it("reports the whole-projection movement against the baseline total", () => {
    expect(relativeTotalDelta(run())).toBe(0.097087);
  });

  it("reports no relative movement where the baseline totals zero", () => {
    const produced = run({ forecastRun: baseline(zeroSumSeries()) });
    expect(produced.totalBaseline).toBe(0);
    expect(relativeTotalDelta(produced)).toBeNull();
  });

  it("refers downstream to the run and the lever set it pinned", () => {
    const produced = run();
    expect(simulationReference(produced)).toEqual({
      simulationRunId: produced.id,
      scenarioKey: "budget.austerity.2027",
      scenarioVersion: produced.scenarioVersion,
    });
  });
});
