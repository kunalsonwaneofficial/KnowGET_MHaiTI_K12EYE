import { describe, expect, it } from "vitest";

import type { TenantId, Uuid } from "@knowget/types";
import {
  EmptyMetricKeyError,
  EmptySeriesKeyError,
  InvalidCycleLengthError,
  InvalidObservationPeriodError,
  InvalidSeriesTransitionError,
  NonFiniteObservationError,
  ObservationAlreadyRecordedError,
  ObservationNotFoundError,
  SeriesClosedError,
} from "./errors";
import type { ObservationSeries, ObservationSeriesParams } from "./observation-series";
import {
  closeSeries,
  correctObservation,
  declareCycleLength,
  declareObservationSeries,
  earliestObservation,
  isSeriesForecastable,
  isSeriesOpen,
  latestObservation,
  observationAt,
  observationCount,
  recordObservation,
  recordObservations,
  reopenSeries,
  toSeriesView,
  withdrawObservation,
} from "./observation-series";

const TENANT = "11111111-1111-4111-8111-111111111111" as TenantId;
const ORGANIZATION = "22222222-2222-4222-8222-222222222222" as Uuid;

const params = (overrides: Partial<ObservationSeriesParams> = {}): ObservationSeriesParams => ({
  tenantId: TENANT,
  organizationId: ORGANIZATION,
  seriesKey: "attendance.rate.grade7",
  metricKey: "attendance.rate",
  sourceDomain: "attendance",
  grain: "month",
  direction: "higher_is_better",
  ...overrides,
});

const declare = (overrides: Partial<ObservationSeriesParams> = {}): ObservationSeries =>
  declareObservationSeries(params(overrides));

const withHistory = (count: number, overrides: Partial<ObservationSeriesParams> = {}) =>
  recordObservations(
    declare(overrides),
    Array.from({ length: count }, (_, index) => ({
      period: index,
      value: 90 + index,
      label: `2026-${String(index + 1).padStart(2, "0")}`,
    })),
  );

describe("declareObservationSeries", () => {
  it("starts empty, active and at version 1", () => {
    const series = declare();
    expect(series.observations).toEqual([]);
    expect(series.version).toBe(1);
    expect(series.status).toBe("active");
    expect(series.closedAt).toBeNull();
  });

  it("normalizes the keys and the source domain", () => {
    const series = declare({
      seriesKey: "  Attendance.Rate.Grade7 ",
      metricKey: " Attendance.Rate ",
      sourceDomain: " Attendance ",
    });
    expect(series.seriesKey).toBe("attendance.rate.grade7");
    expect(series.metricKey).toBe("attendance.rate");
    expect(series.sourceDomain).toBe("attendance");
  });

  it("refuses a blank series key", () => {
    expect(() => declare({ seriesKey: "   " })).toThrow(EmptySeriesKeyError);
  });

  it("refuses a blank metric key", () => {
    expect(() => declare({ metricKey: "" })).toThrow(EmptyMetricKeyError);
  });

  it("leaves the seasonal cycle undeclared rather than inferring one from the grain", () => {
    expect(declare({ grain: "month" }).cycleLength).toBeNull();
  });

  it("refuses a cycle that is not a whole number above one", () => {
    expect(() => declare({ cycleLength: 1 })).toThrow(InvalidCycleLengthError);
    expect(() => declare({ cycleLength: 4.5 })).toThrow(InvalidCycleLengthError);
  });
});

describe("recordObservation", () => {
  it("appends and advances the version", () => {
    const series = recordObservation(declare(), { period: 0, value: 91, label: "2026-01" });
    expect(observationCount(series)).toBe(1);
    expect(series.version).toBe(2);
  });

  it("advances the version on an append, not only on a correction", () => {
    // A run pins `seriesVersion`; an append changes what a re-run computes, so it must change the version.
    const one = withHistory(4);
    const two = recordObservation(one, { period: 4, value: 95, label: "2026-05" });
    expect(two.version).toBe(one.version + 1);
  });

  it("refuses a period that is already there", () => {
    const series = recordObservation(declare(), { period: 3, value: 91, label: "2026-04" });
    expect(() => recordObservation(series, { period: 3, value: 92, label: "2026-04" })).toThrow(
      ObservationAlreadyRecordedError,
    );
  });

  it("refuses a fractional period", () => {
    expect(() => recordObservation(declare(), { period: 1.5, value: 91, label: "x" })).toThrow(
      InvalidObservationPeriodError,
    );
  });

  it("refuses a non-finite value", () => {
    expect(() =>
      recordObservation(declare(), { period: 0, value: Number.NaN, label: "x" }),
    ).toThrow(NonFiniteObservationError);
    expect(() =>
      recordObservation(declare(), { period: 0, value: Number.POSITIVE_INFINITY, label: "x" }),
    ).toThrow(NonFiniteObservationError);
  });

  it("rounds the value and trims the label", () => {
    const series = recordObservation(declare(), {
      period: 0,
      value: 91.1234567891,
      label: "  2026-01  ",
    });
    expect(observationAt(series, 0)).toEqual({ period: 0, value: 91.123457, label: "2026-01" });
  });
});

describe("recordObservations", () => {
  it("advances the version once for the whole batch", () => {
    const series = withHistory(12);
    expect(observationCount(series)).toBe(12);
    expect(series.version).toBe(2);
  });

  it("holds observations sorted by period whatever order they arrived in", () => {
    const series = recordObservations(declare(), [
      { period: 5, value: 95, label: "f" },
      { period: 1, value: 91, label: "b" },
      { period: 3, value: 93, label: "d" },
    ]);
    expect(series.observations.map((observation) => observation.period)).toEqual([1, 3, 5]);
  });

  it("refuses a duplicate inside the batch rather than deduplicating it", () => {
    expect(() =>
      recordObservations(declare(), [
        { period: 2, value: 91, label: "c" },
        { period: 2, value: 92, label: "c" },
      ]),
    ).toThrow(ObservationAlreadyRecordedError);
  });

  it("leaves the series untouched when any row in the batch is bad", () => {
    const series = withHistory(4);
    expect(() =>
      recordObservations(series, [
        { period: 4, value: 95, label: "e" },
        { period: 5, value: Number.NaN, label: "f" },
      ]),
    ).toThrow(NonFiniteObservationError);
    expect(observationCount(series)).toBe(4);
    expect(series.version).toBe(2);
  });

  it("is a no-op for an empty batch", () => {
    const series = withHistory(4);
    expect(recordObservations(series, [])).toBe(series);
  });
});

describe("correctObservation", () => {
  it("restates the value and advances the version", () => {
    const series = correctObservation(withHistory(4), 2, 99);
    expect(observationAt(series, 2)?.value).toBe(99);
    expect(series.version).toBe(3);
  });

  it("keeps the existing label when none is supplied", () => {
    const series = correctObservation(withHistory(4), 2, 99);
    expect(observationAt(series, 2)?.label).toBe("2026-03");
  });

  it("refuses a period that was never recorded", () => {
    expect(() => correctObservation(withHistory(4), 9, 99)).toThrow(ObservationNotFoundError);
  });

  it("does not advance the version when nothing actually changed", () => {
    const series = withHistory(4);
    const same = correctObservation(series, 2, 92, "2026-03");
    expect(same).toBe(series);
  });

  it("refuses a non-finite restatement", () => {
    expect(() => correctObservation(withHistory(4), 2, Number.NaN)).toThrow(
      NonFiniteObservationError,
    );
  });
});

describe("withdrawObservation", () => {
  it("removes the period and advances the version", () => {
    const series = withdrawObservation(withHistory(4), 1);
    expect(observationAt(series, 1)).toBeNull();
    expect(observationCount(series)).toBe(3);
    expect(series.version).toBe(3);
  });

  it("is distinct from correcting to zero", () => {
    const withdrawn = withdrawObservation(withHistory(4), 1);
    const zeroed = correctObservation(withHistory(4), 1, 0);
    expect(observationAt(withdrawn, 1)).toBeNull();
    expect(observationAt(zeroed, 1)?.value).toBe(0);
  });

  it("refuses a period that was never recorded", () => {
    expect(() => withdrawObservation(withHistory(4), 9)).toThrow(ObservationNotFoundError);
  });
});

describe("declareCycleLength", () => {
  it("advances the version, because the cycle is not in the reproducibility digest", () => {
    const series = withHistory(24);
    const seasonal = declareCycleLength(series, 12);
    expect(seasonal.cycleLength).toBe(12);
    expect(seasonal.version).toBe(series.version + 1);
  });

  it("can withdraw a declared cycle", () => {
    const seasonal = declareCycleLength(withHistory(24), 12);
    expect(declareCycleLength(seasonal, null).cycleLength).toBeNull();
  });

  it("refuses a cycle that is not a whole number above one", () => {
    expect(() => declareCycleLength(withHistory(24), 0)).toThrow(InvalidCycleLengthError);
  });

  it("is a no-op when the cycle is unchanged", () => {
    const seasonal = declareCycleLength(withHistory(24), 12);
    expect(declareCycleLength(seasonal, 12)).toBe(seasonal);
  });
});

describe("closeSeries", () => {
  it("freezes the series against further observations", () => {
    const closed = closeSeries(withHistory(4));
    expect(isSeriesOpen(closed)).toBe(false);
    expect(closed.closedAt).not.toBeNull();
    expect(() => recordObservation(closed, { period: 4, value: 95, label: "e" })).toThrow(
      SeriesClosedError,
    );
  });

  it("freezes it against corrections too, so a late restatement is three visible acts", () => {
    const closed = closeSeries(withHistory(4));
    expect(() => correctObservation(closed, 2, 99)).toThrow(SeriesClosedError);

    const corrected = closeSeries(correctObservation(reopenSeries(closed), 2, 99));
    expect(observationAt(corrected, 2)?.value).toBe(99);
    expect(corrected.status).toBe("closed");
  });

  it("does not advance the version, because nothing the series says has changed", () => {
    const series = withHistory(4);
    expect(closeSeries(series).version).toBe(series.version);
  });

  it("refuses to close twice", () => {
    expect(() => closeSeries(closeSeries(withHistory(4)))).toThrow(InvalidSeriesTransitionError);
  });

  it("refuses to reopen a series that is already open", () => {
    expect(() => reopenSeries(withHistory(4))).toThrow(InvalidSeriesTransitionError);
  });
});

describe("reading", () => {
  it("exposes the engines' view", () => {
    const series = declareCycleLength(withHistory(24), 12);
    expect(toSeriesView(series)).toEqual({
      seriesKey: series.seriesKey,
      grain: "month",
      direction: "higher_is_better",
      cycleLength: 12,
      observations: series.observations,
    });
  });

  it("reports the earliest and latest observation", () => {
    const series = withHistory(4);
    expect(earliestObservation(series)?.period).toBe(0);
    expect(latestObservation(series)?.period).toBe(3);
  });

  it("reports null ends for an empty series", () => {
    expect(earliestObservation(declare())).toBeNull();
    expect(latestObservation(declare())).toBeNull();
  });

  it("agrees with the series engine about forecastability", () => {
    expect(isSeriesForecastable(declare())).toBe(false);
    expect(isSeriesForecastable(withHistory(3))).toBe(false);
    expect(isSeriesForecastable(withHistory(6))).toBe(true);
  });
});
