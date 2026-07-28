import { describe, expect, it } from "vitest";

import type { TenantId, Uuid } from "@knowget/types";
import {
  HorizonExceedsHistoryError,
  InvalidRunTransitionError,
  ModelNotPublishedError,
  RunNotReproducibleError,
  RunStillReproducesError,
  SeriesNotForecastableError,
  UndeclaredAssumptionsError,
} from "./errors";
import type { ForecastModel, ForecastModelParams } from "./forecast-model";
import { draftForecastModel, publishModel, retireModel } from "./forecast-model";
import type { ForecastRun, ForecastRunParams } from "./forecast-run";
import {
  invalidateRun,
  isRunCurrent,
  pointAtHorizon,
  produceForecastRun,
  requireReproducibleRun,
  runInputs,
  runReference,
  supersedeRun,
  verifyRun,
} from "./forecast-run";
import { REQUIRED_CONFIDENCE_LEVEL } from "./forecast-value";
import type { AssumptionView } from "./forecast-view";
import type { ObservationSeries, ObservationSeriesParams } from "./observation-series";
import {
  correctObservation,
  declareCycleLength,
  declareObservationSeries,
  recordObservation,
  recordObservations,
  toSeriesView,
} from "./observation-series";
import { reproducibilityKeyOf } from "./reproducibility";

const TENANT = "11111111-1111-4111-8111-111111111111" as TenantId;
const ORGANIZATION = "22222222-2222-4222-8222-222222222222" as Uuid;
const REPLACEMENT = "33333333-3333-4333-8333-333333333333" as Uuid;
const ANALYST = "44444444-4444-4444-8444-444444444444" as Uuid;

const series = (count = 12, overrides: Partial<ObservationSeriesParams> = {}): ObservationSeries =>
  recordObservations(
    declareObservationSeries({
      tenantId: TENANT,
      organizationId: ORGANIZATION,
      seriesKey: "attendance.rate.grade7",
      metricKey: "attendance.rate",
      sourceDomain: "attendance",
      grain: "month",
      direction: "higher_is_better",
      ...overrides,
    }),
    Array.from({ length: count }, (_, index) => ({
      period: index,
      value: 90 + index,
      label: `2026-${String(index + 1).padStart(2, "0")}`,
    })),
  );

const model = (overrides: Partial<ForecastModelParams> = {}, version = 1): ForecastModel =>
  publishModel(
    draftForecastModel({
      tenantId: TENANT,
      organizationId: ORGANIZATION,
      modelKey: "attendance.linear",
      name: "Attendance linear trend",
      method: "linear_trend",
      ...overrides,
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

const SEASONALITY: AssumptionView = {
  assumptionKey: "term_pattern_repeats",
  kind: "seasonality",
  basis: "observed_history",
  holderId: null,
  reference: null,
  expectedValue: null,
};

const ASSUMPTIONS: readonly AssumptionView[] = [CONTINUITY];

const params = (overrides: Partial<ForecastRunParams> = {}): ForecastRunParams => ({
  series: series(),
  model: model(),
  horizon: 3,
  assumptions: ASSUMPTIONS,
  ...overrides,
});

const run = (overrides: Partial<ForecastRunParams> = {}): ForecastRun =>
  produceForecastRun(params(overrides));

describe("produceForecastRun", () => {
  it("produces a completed run carrying points, uncertainty and a digest", () => {
    const produced = run();
    expect(produced.status).toBe("completed");
    expect(produced.points).toHaveLength(3);
    expect(produced.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(produced.uncertainty.grade).toBeDefined();
    expect(produced.invalidationDrift).toEqual([]);
  });

  it("derives the tenant and organization from the series rather than accepting them", () => {
    const elsewhere = "55555555-5555-4555-8555-555555555555" as Uuid;
    const produced = run({ series: series(12, { organizationId: elsewhere }) });
    expect(produced.tenantId).toBe(TENANT);
    expect(produced.organizationId).toBe(elsewhere);
  });

  it("pins the series and model versions it read", () => {
    const history = series();
    const method = model();
    const produced = run({ series: history, model: method });
    expect(produced.seriesVersion).toBe(history.version);
    expect(produced.modelVersion).toBe(method.version);
    expect(produced.seriesId).toBe(history.id);
    expect(produced.modelId).toBe(method.id);
  });

  it("pins the resolved parameters, not the ones the model asked for", () => {
    const produced = run({
      model: model({ method: "moving_average", parameters: { windowSize: 20 } }),
    });
    expect(produced.parameters.windowSize).toBe(12);
    expect(produced.parameters.alpha).toBe(0.3);
  });

  it("gives every point the required interval", () => {
    for (const point of run().points) {
      const levels = point.intervals.map((interval) => interval.level);
      expect(levels).toContain(REQUIRED_CONFIDENCE_LEVEL);
      expect(point.intervalWidth).toBeGreaterThan(0);
    }
  });

  it("reaches exactly the requested horizon, one point per period ahead", () => {
    const produced = run({ horizon: 5 });
    expect(produced.points.map((point) => point.horizon)).toEqual([1, 2, 3, 4, 5]);
    expect(produced.points.map((point) => point.period)).toEqual([12, 13, 14, 15, 16]);
  });

  it("renders future periods by index, because nothing has named them yet", () => {
    expect(run().points[0]?.label).toBe("P12");
  });

  it("records who produced it, or that nobody did", () => {
    expect(run().producedByUserId).toBeNull();
    expect(run({ producedByUserId: ANALYST }).producedByUserId).toBe(ANALYST);
  });

  it("stamps production and creation together", () => {
    const produced = run();
    expect(produced.producedAt).toBe(produced.createdAt);
    expect(produced.updatedAt).toBe(produced.createdAt);
  });
});

describe("the digest", () => {
  it("is self-consistent: the run's own inputs rehash to the digest it stored", () => {
    const produced = run();
    const rehashed = reproducibilityKeyOf(runInputs(produced));
    expect(rehashed.digest).toBe(produced.digest);
    expect(rehashed.canonical).toBe(produced.canonical);
  });

  it("stays self-consistent when the parameters were clamped on the way in", () => {
    const produced = run({
      model: model({ method: "moving_average", parameters: { windowSize: 20 } }),
    });
    expect(reproducibilityKeyOf(runInputs(produced)).digest).toBe(produced.digest);
  });

  it("is shared by two runs over identical inputs, which are still distinct records", () => {
    const history = series();
    const method = model();
    const first = run({ series: history, model: method });
    const second = run({ series: history, model: method });
    expect(second.digest).toBe(first.digest);
    expect(second.id).not.toBe(first.id);
  });

  it("moves when the series does, because the version is pinned", () => {
    const history = series();
    const extended = recordObservation(history, { period: 12, value: 102, label: "2027-01" });
    expect(run({ series: extended, horizon: 3 }).digest).not.toBe(run({ series: history }).digest);
  });

  it("moves when the assumptions do, at identical numbers", () => {
    const other: AssumptionView = { ...CONTINUITY, assumptionKey: "intake_grows" };
    const first = run();
    const second = run({ assumptions: [other] });
    expect(second.points.map((point) => point.value)).toEqual(
      first.points.map((point) => point.value),
    );
    expect(second.digest).not.toBe(first.digest);
  });

  it("normalizes assumption keys on the way in, so two spellings are one assumption", () => {
    const shouted: AssumptionView = { ...CONTINUITY, assumptionKey: "  Intake_Flat " };
    const produced = run({ assumptions: [shouted] });
    expect(produced.assumptions[0]?.assumptionKey).toBe("intake_flat");
    expect(produced.digest).toBe(run().digest);
  });
});

describe("what a run refuses", () => {
  it("refuses a model that was never published", () => {
    const draft = draftForecastModel({
      tenantId: TENANT,
      organizationId: ORGANIZATION,
      modelKey: "attendance.linear",
      name: "Attendance linear trend",
      method: "linear_trend",
    });
    expect(() => run({ model: draft })).toThrow(ModelNotPublishedError);
  });

  it("refuses a retired model, whose earlier runs stay perfectly valid", () => {
    expect(() => run({ model: retireModel(model()) })).toThrow(ModelNotPublishedError);
  });

  it("refuses a series too short to forecast from", () => {
    expect(() => run({ series: series(3) })).toThrow(SeriesNotForecastableError);
  });

  it("refuses a horizon past the ceiling its history permits", () => {
    expect(() => run({ horizon: 7 })).toThrow(HorizonExceedsHistoryError);
    expect(run({ horizon: 6 }).horizon).toBe(6);
  });

  it("refuses a horizon that is not a whole number of periods ahead", () => {
    expect(() => run({ horizon: 0 })).toThrow(HorizonExceedsHistoryError);
    expect(() => run({ horizon: 2.5 })).toThrow(HorizonExceedsHistoryError);
  });

  it("refuses a forecast that declares no assumptions at all", () => {
    expect(() => run({ assumptions: [] })).toThrow(UndeclaredAssumptionsError);
  });

  it("refuses an assumption that does not name its own grounds", () => {
    const unheld: AssumptionView = { ...CONTINUITY, basis: "expert_judgement" };
    expect(() => run({ assumptions: [unheld] })).toThrow(UndeclaredAssumptionsError);
  });

  it("refuses a seasonal method under a set that never declared seasonality", () => {
    const seasonal = declareCycleLength(series(24), 12);
    expect(() =>
      run({
        series: seasonal,
        model: model({ modelKey: "attendance.seasonal", method: "seasonal_naive" }),
        horizon: 3,
      }),
    ).toThrow(UndeclaredAssumptionsError);
  });

  it("accepts that same set once seasonality is declared", () => {
    const seasonal = declareCycleLength(series(24), 12);
    const produced = run({
      series: seasonal,
      model: model({ modelKey: "attendance.seasonal", method: "seasonal_naive" }),
      horizon: 3,
      assumptions: [CONTINUITY, SEASONALITY],
    });
    expect(produced.method).toBe("seasonal_naive");
  });

  it("does not refuse on a suspected contradiction alone, which is a report and not a gate", () => {
    const four: AssumptionView = {
      assumptionKey: "capacity_four_hundred",
      kind: "exogenous",
      basis: "observed_history",
      holderId: null,
      reference: null,
      expectedValue: 400,
    };
    const five: AssumptionView = {
      ...four,
      assumptionKey: "capacity_five_hundred",
      expectedValue: 500,
    };
    expect(run({ assumptions: [four, five] }).status).toBe("completed");
  });

  it("names the blocking issue rather than the suspicion when both are present", () => {
    const unheld: AssumptionView = {
      ...CONTINUITY,
      basis: "expert_judgement",
      expectedValue: 400,
    };
    const other: AssumptionView = {
      ...unheld,
      assumptionKey: "intake_grows",
      expectedValue: 500,
    };
    expect(() => run({ assumptions: [unheld, other] })).toThrow(/missing_holder/);
    expect(() => run({ assumptions: [unheld, other] })).not.toThrow(/contradictory/);
  });
});

describe("supersedeRun", () => {
  it("records which run replaced it", () => {
    const superseded = supersedeRun(run(), REPLACEMENT);
    expect(superseded.status).toBe("superseded");
    expect(superseded.supersededByRunId).toBe(REPLACEMENT);
    expect(superseded.supersededAt).not.toBeNull();
  });

  it("leaves the forecast itself exactly as it was stated", () => {
    const produced = run();
    const superseded = supersedeRun(produced, REPLACEMENT);
    expect(superseded.points).toEqual(produced.points);
    expect(superseded.digest).toBe(produced.digest);
  });

  it("refuses to be superseded twice", () => {
    expect(() => supersedeRun(supersedeRun(run(), REPLACEMENT), REPLACEMENT)).toThrow(
      InvalidRunTransitionError,
    );
  });
});

describe("verifyRun", () => {
  const recompute = (from: ObservationSeries, produced: ForecastRun) => {
    const rerun = produceForecastRun(
      params({ series: from, model: model(), horizon: produced.horizon }),
    );
    return { inputs: runInputs(rerun), points: rerun.points };
  };

  it("reports a run reproducing from its own recorded inputs", () => {
    const history = series();
    const produced = run({ series: history });
    const again = recompute(history, produced);
    const verdict = verifyRun(produced, again.inputs, again.points);
    expect(verdict.reproducible).toBe(true);
    expect(verdict.drift).toEqual([]);
    expect(verdict.maxValueDelta).toBe(0);
  });

  it("names the series version when a late correction moved the history under it", () => {
    const history = series();
    const produced = run({ series: history });
    const corrected = correctObservation(history, 5, 40);
    const again = recompute(corrected, produced);
    const verdict = verifyRun(produced, again.inputs, again.points);
    expect(verdict.reproducible).toBe(false);
    expect(verdict.drift).toContain("series_version_changed");
    expect(verdict.drift).toContain("values_changed");
  });

  it("does not change the run it inspected", () => {
    const history = series();
    const produced = run({ series: history });
    const again = recompute(history, produced);
    verifyRun(produced, again.inputs, again.points);
    expect(produced.status).toBe("completed");
    expect(produced.invalidatedAt).toBeNull();
  });
});

describe("invalidateRun", () => {
  const drifted = (produced: ForecastRun) => {
    const corrected = correctObservation(series(), 5, 40);
    const rerun = produceForecastRun(
      params({ series: corrected, model: model(), horizon: produced.horizon }),
    );
    return { inputs: runInputs(rerun), points: rerun.points };
  };

  it("refuses while the run still reproduces exactly", () => {
    const history = series();
    const produced = run({ series: history });
    const same = produceForecastRun(params({ series: history, model: model() }));
    expect(() => invalidateRun(produced, runInputs(same), same.points)).toThrow(
      RunStillReproducesError,
    );
  });

  it("marks the run and records what had moved", () => {
    const produced = run();
    const evidence = drifted(produced);
    const invalidated = invalidateRun(produced, evidence.inputs, evidence.points);
    expect(invalidated.status).toBe("invalidated");
    expect(invalidated.invalidatedAt).not.toBeNull();
    expect(invalidated.invalidationDrift).toContain("series_version_changed");
  });

  it("still applies to a superseded run, because reproducibility is a fact about the record", () => {
    const produced = supersedeRun(run(), REPLACEMENT);
    const evidence = drifted(produced);
    const invalidated = invalidateRun(produced, evidence.inputs, evidence.points);
    expect(invalidated.status).toBe("invalidated");
    expect(invalidated.supersededByRunId).toBe(REPLACEMENT);
  });

  it("refuses to invalidate a run that is already invalidated", () => {
    const produced = run();
    const evidence = drifted(produced);
    const invalidated = invalidateRun(produced, evidence.inputs, evidence.points);
    expect(() => invalidateRun(invalidated, evidence.inputs, evidence.points)).toThrow(
      InvalidRunTransitionError,
    );
  });
});

describe("reading", () => {
  it("lets only a current run be built on", () => {
    const produced = run();
    expect(requireReproducibleRun(produced)).toBe(produced);
    expect(() => requireReproducibleRun(supersedeRun(produced, REPLACEMENT))).toThrow(
      RunNotReproducibleError,
    );
  });

  it("reports whether the run is still the institution's current answer", () => {
    const produced = run();
    expect(isRunCurrent(produced)).toBe(true);
    expect(isRunCurrent(supersedeRun(produced, REPLACEMENT))).toBe(false);
  });

  it("finds a point by how far ahead it reaches", () => {
    const produced = run();
    expect(pointAtHorizon(produced, 2)?.period).toBe(13);
    expect(pointAtHorizon(produced, 9)).toBeNull();
  });

  it("refers to itself by id and digest", () => {
    const produced = run();
    expect(runReference(produced)).toEqual({ runId: produced.id, digest: produced.digest });
  });

  it("reads the same history the series engine sees", () => {
    const history = series();
    expect(toSeriesView(history).observations).toHaveLength(12);
  });
});
