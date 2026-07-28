import { describe, expect, it } from "vitest";

import type { TenantId, Uuid } from "@knowget/types";
import { isPublishable } from "./accuracy";
import type { Backtest, BacktestParams } from "./backtest";
import {
  beatsBaseline,
  intervalsAreHonest,
  requireEarnedPublication,
  runBacktest,
  scoredPeriods,
  unscoredHoldoutSize,
} from "./backtest";
import {
  HoldoutTooSmallError,
  ModelNotPublishableError,
  SeriesNotForecastableError,
} from "./errors";
import type { ForecastModel, ForecastModelParams } from "./forecast-model";
import { draftForecastModel, publishModel, retireModel } from "./forecast-model";
import { REQUIRED_CONFIDENCE_LEVEL } from "./forecast-value";
import type { ObservationSeries, ObservationSeriesParams } from "./observation-series";
import { declareObservationSeries, recordObservations } from "./observation-series";
import { maxHoldoutSize } from "./series";

const TENANT = "11111111-1111-4111-8111-111111111111" as TenantId;
const ORGANIZATION = "22222222-2222-4222-8222-222222222222" as Uuid;
const ANALYST = "44444444-4444-4444-8444-444444444444" as Uuid;

/**
 * A perfectly linear history: `value = 90 + period`.
 *
 * Chosen so the arithmetic in these tests is checkable by hand. `linear_trend` fits it exactly, which pins the
 * model's error at zero; the naive baseline is always one step behind, which pins its error to the mean of the
 * horizons scored. Every skill and coverage figure below follows from those two facts.
 */
const seriesOver = (
  periods: readonly number[],
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
      ...overrides,
    }),
    periods.map((period) => ({
      period,
      value: 90 + period,
      label: `2026-${String(period + 1).padStart(2, "0")}`,
    })),
  );

const series = (count = 12, overrides: Partial<ObservationSeriesParams> = {}): ObservationSeries =>
  seriesOver(
    Array.from({ length: count }, (_, index) => index),
    overrides,
  );

const draft = (overrides: Partial<ForecastModelParams> = {}): ForecastModel =>
  draftForecastModel({
    tenantId: TENANT,
    organizationId: ORGANIZATION,
    modelKey: "attendance.linear",
    name: "Attendance linear trend",
    method: "linear_trend",
    ...overrides,
  });

const params = (overrides: Partial<BacktestParams> = {}): BacktestParams => ({
  series: series(),
  model: draft(),
  ...overrides,
});

const backtest = (overrides: Partial<BacktestParams> = {}): Backtest =>
  runBacktest(params(overrides));

describe("runBacktest", () => {
  it("splits the history chronologically and scores only the later half", () => {
    const result = backtest();
    expect(result.trainingCount).toBe(8);
    expect(result.holdoutSize).toBe(4);
    expect(result.firstHoldoutPeriod).toBe(8);
    expect(result.lastHoldoutPeriod).toBe(11);
  });

  it("narrows the holdout until the training prefix could have carried the horizon it implies", () => {
    // The series engine would allow six of twelve periods to be held back, but that leaves six observations
    // being asked to forecast six periods ahead — a span `produceForecastRun` refuses outright. Scoring it
    // would produce an accuracy figure for a claim the platform will not make.
    expect(maxHoldoutSize(12)).toBe(6);
    expect(backtest().holdoutSize).toBe(4);
  });

  it("pins the series version it scored against", () => {
    const scored = series();
    expect(backtest({ series: scored }).seriesVersion).toBe(scored.version);
  });

  it("scores a draft at version zero, because backtesting is what earns publication", () => {
    const result = backtest({ model: draft() });
    expect(result.modelVersion).toBe(0);
    expect(result.publishable).toBe(true);
  });

  it("scores a published model at the version published", () => {
    expect(backtest({ model: publishModel(draft(), 3) }).modelVersion).toBe(3);
  });

  it("scores a retired model, because asking how it would have done is a fair retrospective", () => {
    const retired = retireModel(publishModel(draft(), 1));
    expect(backtest({ model: retired }).modelVersion).toBe(1);
  });

  it("takes its tenant and organization from the series it scored", () => {
    const result = backtest();
    expect(result.tenantId).toBe(TENANT);
    expect(result.organizationId).toBe(ORGANIZATION);
  });

  it("records the method and the identifiers of both sides", () => {
    const scored = series();
    const model = publishModel(draft(), 1);
    const result = backtest({ series: scored, model });
    expect(result.method).toBe("linear_trend");
    expect(result.seriesId).toBe(scored.id);
    expect(result.seriesKey).toBe("attendance.rate.grade7");
    expect(result.modelId).toBe(model.id);
    expect(result.modelKey).toBe("attendance.linear");
  });

  it("resolves the parameters against the training prefix, not the whole series", () => {
    // Twelve observations, eight of them training. A window of twelve is clamped to what the model could
    // actually see, and pinning the clamped figure is what makes the score readable a year later.
    const wide = draft({ method: "moving_average", parameters: { windowSize: 12 } });
    expect(backtest({ model: wide }).parameters.windowSize).toBe(8);
  });

  it("stamps who ran it, or null where nobody was named", () => {
    expect(backtest({ ranByUserId: ANALYST }).ranByUserId).toBe(ANALYST);
    expect(backtest().ranByUserId).toBeNull();
  });

  it("is written once and never edited", () => {
    const result = backtest();
    expect(result.updatedAt).toBe(result.createdAt);
    expect(result.ranAt).toBe(result.createdAt);
  });
});

describe("the holdout", () => {
  it("defaults to the largest split the series can afford", () => {
    expect(backtest().holdoutSize).toBe(4);
  });

  it("honours a smaller request", () => {
    const result = backtest({ holdoutSize: 2 });
    expect(result.holdoutSize).toBe(2);
    expect(result.trainingCount).toBe(10);
  });

  it("clamps an over-large request rather than refusing it", () => {
    const result = backtest({ holdoutSize: 9 });
    expect(result.holdoutSize).toBe(4);
    expect(result.trainingCount).toBe(8);
  });

  it("clamps up to one, so a backtest never reports itself complete having measured nothing", () => {
    expect(backtest({ holdoutSize: 0 }).holdoutSize).toBe(1);
    expect(backtest({ holdoutSize: -3 }).holdoutSize).toBe(1);
  });

  it("ignores a fractional request and takes the largest affordable split", () => {
    expect(backtest({ holdoutSize: 2.5 }).holdoutSize).toBe(4);
  });

  it("affords a single held-back period at five observations", () => {
    const result = backtest({ series: series(5) });
    expect(result.holdoutSize).toBe(1);
    expect(result.trainingCount).toBe(4);
  });
});

describe("what a backtest refuses", () => {
  it("refuses a series that cannot carry a forecast at all", () => {
    expect(() => backtest({ series: series(3) })).toThrow(SeriesNotForecastableError);
  });

  it("refuses an empty series", () => {
    expect(() => backtest({ series: series(0) })).toThrow(SeriesNotForecastableError);
  });

  it("refuses a series long enough to forecast but too short to split", () => {
    // Four observations is exactly the fitting floor. Holding any of them back would put the training set
    // below it, so there is no honest split and the error says so rather than inventing one.
    expect(() => backtest({ series: series(4) })).toThrow(HoldoutTooSmallError);
  });

  it("says how few observations there were", () => {
    expect(() => backtest({ series: series(4) })).toThrow(/4 observations/);
  });
});

describe("scoring", () => {
  it("pairs each forecast with the actual for its own period", () => {
    const result = backtest();
    expect(result.scored.map((point) => point.period)).toEqual([8, 9, 10, 11]);
    expect(result.scored.map((point) => point.actual)).toEqual([98, 99, 100, 101]);
    expect(result.scored.map((point) => point.horizon)).toEqual([1, 2, 3, 4]);
  });

  it("reports no error where the method fits the history exactly", () => {
    const result = backtest();
    expect(result.scores.meanAbsoluteError).toBe(0);
    expect(result.scores.rootMeanSquaredError).toBe(0);
    expect(result.scores.meanAbsolutePercentageError).toBe(0);
    expect(result.scores.sampleSize).toBe(4);
  });

  it("measures the naive baseline over the same holdout", () => {
    // The baseline repeats period 7's value of 97 across periods 8 to 11, so it is out by 1, 2, 3 and 4.
    expect(backtest().baselineMeanAbsoluteError).toBe(2.5);
  });

  it("scores skill against that baseline rather than against nothing", () => {
    expect(backtest().scores.skillScore).toBe(1);
  });

  it("scores the intervals as well as the points, at the level every forecast must carry", () => {
    const result = backtest();
    expect(result.scores.coverageLevel).toBe(REQUIRED_CONFIDENCE_LEVEL);
    expect(result.scores.intervalCoverage).toBe(100);
    expect(
      result.scored.every((point) =>
        point.intervals.some((interval) => interval.level === REQUIRED_CONFIDENCE_LEVEL),
      ),
    ).toBe(true);
  });

  it("carries every level the model quoted onto each scored point", () => {
    const quoted = draft({ confidenceLevels: [95, 50] });
    const result = backtest({ model: quoted });
    expect(result.scored[0]?.intervals.map((interval) => interval.level)).toEqual([50, 80, 95]);
  });

  it("scores only the held-back periods a forecast could be paired with", () => {
    // Period 8 is missing. The model forecasts periods 8 to 11 from a training set ending at 7, and the
    // holdout runs 9 to 12, so three periods overlap. Positional matching would have scored period 8's
    // forecast against period 9's actual and blamed the model for the join.
    const gapped = seriesOver([0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12]);
    const result = backtest({ series: gapped });
    expect(result.holdoutSize).toBe(4);
    expect(result.firstHoldoutPeriod).toBe(9);
    expect(result.lastHoldoutPeriod).toBe(12);
    expect(result.scores.sampleSize).toBe(3);
    expect(scoredPeriods(result)).toEqual([9, 10, 11]);
    expect(unscoredHoldoutSize(result)).toBe(1);
  });
});

describe("publishability", () => {
  it("passes a model that beat the baseline without overstating its confidence", () => {
    const result = backtest();
    expect(beatsBaseline(result)).toBe(true);
    expect(intervalsAreHonest(result)).toBe(true);
    expect(result.publishable).toBe(true);
    expect(requireEarnedPublication(result)).toBe(result);
  });

  it("does not disqualify intervals that were wider than they needed to be", () => {
    // Exact forecasts fall inside every interval, so coverage is 100% against a level of 80. That is a cost
    // paid in vagueness, not a claim anybody was misled by, and refusing publication for it would turn the
    // safest models on offer away.
    const result = backtest();
    expect(result.scores.calibration).toBe("underconfident");
    expect(result.publishable).toBe(true);
  });

  it("refuses a model that only matched the baseline", () => {
    const naive = draft({
      modelKey: "attendance.naive",
      name: "Attendance naive",
      method: "naive",
    });
    const result = backtest({ model: naive });
    expect(result.scores.skillScore).toBe(0);
    expect(beatsBaseline(result)).toBe(false);
    expect(result.publishable).toBe(false);
    expect(() => requireEarnedPublication(result)).toThrow(ModelNotPublishableError);
  });

  it("refuses a model whose intervals caught fewer outcomes than they claimed", () => {
    const naive = draft({
      modelKey: "attendance.naive",
      name: "Attendance naive",
      method: "naive",
    });
    const result = backtest({ model: naive });
    expect(result.scores.intervalCoverage).toBe(25);
    expect(result.scores.calibration).toBe("overconfident");
    expect(intervalsAreHonest(result)).toBe(false);
  });

  it("names the model and its evidence when it refuses", () => {
    const naive = draft({
      modelKey: "attendance.naive",
      name: "Attendance naive",
      method: "naive",
    });
    expect(() => requireEarnedPublication(backtest({ model: naive }))).toThrow(/attendance\.naive/);
  });

  it("freezes the verdict beside the evidence it was drawn from", () => {
    const result = backtest();
    expect(result.publishable).toBe(isPublishable(result.scores));
  });
});

describe("reading", () => {
  it("reports the periods a score was actually computed on", () => {
    expect(scoredPeriods(backtest())).toEqual([8, 9, 10, 11]);
  });

  it("reports nothing unscored where the holdout is contiguous", () => {
    expect(unscoredHoldoutSize(backtest())).toBe(0);
  });
});
