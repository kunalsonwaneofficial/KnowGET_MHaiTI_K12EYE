import { describe, expect, it } from "vitest";

import type { Observation, SeriesView } from "./forecast-view";
import {
  countCompleteCycles,
  computeStatistics,
  findGapPeriods,
  inspectSeries,
  maxHoldoutSize,
  seasonalPosition,
  sortObservations,
  splitHoldout,
} from "./series";

const observation = (period: number, value: number): Observation => ({
  period,
  value,
  label: `P${String(period)}`,
});

const series = (overrides: Partial<SeriesView> = {}): SeriesView => ({
  seriesKey: "attendance.daily_rate",
  grain: "month",
  direction: "higher_is_better",
  cycleLength: null,
  observations: [observation(0, 10), observation(1, 12), observation(2, 11), observation(3, 13)],
  ...overrides,
});

describe("sortObservations", () => {
  it("orders by period ascending without mutating the input", () => {
    const given = [observation(3, 1), observation(1, 2), observation(2, 3)];
    const sorted = sortObservations(given);

    expect(sorted.map((entry) => entry.period)).toEqual([1, 2, 3]);
    expect(given.map((entry) => entry.period)).toEqual([3, 1, 2]);
  });

  it("keeps duplicate periods in their given order so duplication stays visible", () => {
    const given = [observation(1, 100), observation(1, 200), observation(0, 5)];

    expect(sortObservations(given).map((entry) => entry.value)).toEqual([5, 100, 200]);
  });

  it("returns an empty array for an empty series", () => {
    expect(sortObservations([])).toEqual([]);
  });
});

describe("findGapPeriods", () => {
  it("finds nothing in a contiguous series", () => {
    expect(findGapPeriods([observation(4, 1), observation(5, 2), observation(6, 3)])).toEqual([]);
  });

  it("names every missing period rather than counting them", () => {
    const gaps = findGapPeriods([observation(1, 1), observation(4, 2), observation(6, 3)]);

    expect(gaps).toEqual([2, 3, 5]);
  });

  it("works from an unsorted input", () => {
    expect(findGapPeriods([observation(6, 3), observation(1, 1), observation(4, 2)])).toEqual([
      2, 3, 5,
    ]);
  });

  it("does not report a gap where a period is duplicated", () => {
    expect(findGapPeriods([observation(1, 1), observation(1, 9), observation(2, 2)])).toEqual([]);
  });

  it("returns no gaps for empty or single-observation series", () => {
    expect(findGapPeriods([])).toEqual([]);
    expect(findGapPeriods([observation(7, 1)])).toEqual([]);
  });

  it("handles negative period indices", () => {
    expect(findGapPeriods([observation(-3, 1), observation(-1, 2)])).toEqual([-2]);
  });
});

describe("countCompleteCycles", () => {
  it("returns zero when no cycle is declared", () => {
    expect(countCompleteCycles([observation(0, 1), observation(11, 2)], null)).toBe(0);
  });

  it("counts whole cycles across the span", () => {
    const observations = Array.from({ length: 24 }, (_, index) => observation(index, index));

    expect(countCompleteCycles(observations, 12)).toBe(2);
  });

  it("measures span rather than density, so a gappy two years still holds two cycles", () => {
    const observations = [
      observation(0, 1),
      observation(5, 2),
      observation(13, 3),
      observation(23, 4),
    ];

    expect(countCompleteCycles(observations, 12)).toBe(2);
  });

  it("floors a partial cycle", () => {
    const observations = Array.from({ length: 18 }, (_, index) => observation(index, index));

    expect(countCompleteCycles(observations, 12)).toBe(1);
  });

  it("rejects a nonsensical cycle length", () => {
    const observations = [observation(0, 1), observation(1, 2)];

    expect(countCompleteCycles(observations, 1)).toBe(0);
    expect(countCompleteCycles(observations, 0)).toBe(0);
    expect(countCompleteCycles(observations, -12)).toBe(0);
    expect(countCompleteCycles(observations, 2.5)).toBe(0);
  });

  it("returns zero for an empty series", () => {
    expect(countCompleteCycles([], 12)).toBe(0);
  });
});

describe("seasonalPosition", () => {
  it("places the origin at position zero", () => {
    expect(seasonalPosition(4, 4, 12)).toBe(0);
  });

  it("wraps at the cycle length", () => {
    expect(seasonalPosition(16, 4, 12)).toBe(0);
    expect(seasonalPosition(17, 4, 12)).toBe(1);
  });

  it("returns a non-negative position for periods before the origin", () => {
    expect(seasonalPosition(1, 4, 12)).toBe(9);
  });

  it("collapses to zero for an unusable cycle length", () => {
    expect(seasonalPosition(9, 0, 1)).toBe(0);
    expect(seasonalPosition(9, 0, 3.5)).toBe(0);
  });
});

describe("inspectSeries", () => {
  it("reports a clean, contiguous, sufficiently long series as forecastable with no issues", () => {
    const inspection = inspectSeries(series());

    expect(inspection.forecastable).toBe(true);
    expect(inspection.issues).toEqual([]);
    expect(inspection.count).toBe(4);
    expect(inspection.firstPeriod).toBe(0);
    expect(inspection.lastPeriod).toBe(3);
    expect(inspection.contiguousSpan).toBe(4);
  });

  it("carries the series key through so the inspection is attributable", () => {
    expect(inspectSeries(series({ seriesKey: "fees.collection_rate" })).seriesKey).toBe(
      "fees.collection_rate",
    );
  });

  it("blocks an empty series", () => {
    const inspection = inspectSeries(series({ observations: [] }));

    expect(inspection.forecastable).toBe(false);
    expect(inspection.issues).toContain("no_observations");
    expect(inspection.firstPeriod).toBeNull();
    expect(inspection.lastPeriod).toBeNull();
    expect(inspection.contiguousSpan).toBe(0);
  });

  it("blocks a series below the observation floor", () => {
    const inspection = inspectSeries(
      series({ observations: [observation(0, 1), observation(1, 2), observation(2, 3)] }),
    );

    expect(inspection.forecastable).toBe(false);
    expect(inspection.issues).toContain("below_observation_floor");
  });

  it("blocks a duplicated period", () => {
    const inspection = inspectSeries(
      series({
        observations: [observation(0, 1), observation(1, 2), observation(1, 9), observation(2, 3)],
      }),
    );

    expect(inspection.forecastable).toBe(false);
    expect(inspection.issues).toContain("duplicate_period");
  });

  it("blocks a non-finite value", () => {
    const inspection = inspectSeries(
      series({
        observations: [
          observation(0, 1),
          observation(1, Number.NaN),
          observation(2, 3),
          observation(3, 4),
        ],
      }),
    );

    expect(inspection.forecastable).toBe(false);
    expect(inspection.issues).toContain("non_finite_value");
  });

  it("blocks a non-integer period", () => {
    const inspection = inspectSeries(
      series({
        observations: [
          observation(0, 1),
          observation(1.5, 2),
          observation(2, 3),
          observation(3, 4),
        ],
      }),
    );

    expect(inspection.forecastable).toBe(false);
    expect(inspection.issues).toContain("non_finite_value");
  });

  it("reports gaps but still allows a forecast, because institutional data has gaps", () => {
    const inspection = inspectSeries(
      series({
        observations: [observation(0, 1), observation(1, 2), observation(3, 3), observation(6, 4)],
      }),
    );

    expect(inspection.issues).toContain("has_gaps");
    expect(inspection.gapPeriods).toEqual([2, 4, 5]);
    expect(inspection.contiguousSpan).toBe(7);
    expect(inspection.forecastable).toBe(true);
  });

  it("reports an out-of-order input without blocking on it", () => {
    const inspection = inspectSeries(
      series({
        observations: [observation(1, 2), observation(0, 1), observation(2, 3), observation(3, 4)],
      }),
    );

    expect(inspection.issues).toContain("unordered_periods");
    expect(inspection.forecastable).toBe(true);
    expect(inspection.firstPeriod).toBe(0);
  });

  it("reports an invalid declared cycle length", () => {
    const inspection = inspectSeries(series({ cycleLength: 1 }));

    expect(inspection.issues).toContain("invalid_cycle_length");
    expect(inspection.completeCycles).toBe(0);
  });

  it("reports an incomplete seasonal cycle when a cycle is declared but not twice observed", () => {
    const observations = Array.from({ length: 14 }, (_, index) => observation(index, index));
    const inspection = inspectSeries(series({ cycleLength: 12, observations }));

    expect(inspection.completeCycles).toBe(1);
    expect(inspection.issues).toContain("seasonal_cycle_incomplete");
    expect(inspection.forecastable).toBe(true);
  });

  it("is satisfied once two whole cycles have been observed", () => {
    const observations = Array.from({ length: 24 }, (_, index) => observation(index, index));
    const inspection = inspectSeries(series({ cycleLength: 12, observations }));

    expect(inspection.completeCycles).toBe(2);
    expect(inspection.issues).not.toContain("seasonal_cycle_incomplete");
  });

  it("never reports a seasonal issue for a series with no declared cycle", () => {
    const inspection = inspectSeries(series());

    expect(inspection.issues).not.toContain("seasonal_cycle_incomplete");
    expect(inspection.issues).not.toContain("invalid_cycle_length");
  });

  it("sorts and de-duplicates its issue codes", () => {
    const inspection = inspectSeries(
      series({
        observations: [
          observation(2, 1),
          observation(0, Number.POSITIVE_INFINITY),
          observation(0, 3),
        ],
      }),
    );

    expect([...inspection.issues]).toEqual([...inspection.issues].sort());
    expect(new Set(inspection.issues).size).toBe(inspection.issues.length);
  });
});

describe("computeStatistics", () => {
  it("returns zeros rather than NaN for an empty series", () => {
    expect(computeStatistics([])).toEqual({
      count: 0,
      mean: 0,
      min: 0,
      max: 0,
      standardDeviation: 0,
      meanAbsoluteChange: 0,
    });
  });

  it("computes mean, extremes and population standard deviation", () => {
    const stats = computeStatistics([
      observation(0, 2),
      observation(1, 4),
      observation(2, 4),
      observation(3, 4),
      observation(4, 5),
      observation(5, 5),
      observation(6, 7),
      observation(7, 9),
    ]);

    expect(stats.count).toBe(8);
    expect(stats.mean).toBe(5);
    expect(stats.min).toBe(2);
    expect(stats.max).toBe(9);
    expect(stats.standardDeviation).toBe(2);
  });

  it("computes the mean absolute period-to-period change", () => {
    const stats = computeStatistics([
      observation(0, 10),
      observation(1, 14),
      observation(2, 12),
      observation(3, 18),
    ]);

    expect(stats.meanAbsoluteChange).toBe(4);
  });

  it("reports no change for a single observation", () => {
    const stats = computeStatistics([observation(0, 42)]);

    expect(stats.count).toBe(1);
    expect(stats.mean).toBe(42);
    expect(stats.standardDeviation).toBe(0);
    expect(stats.meanAbsoluteChange).toBe(0);
  });

  it("is order-insensitive because it sorts first", () => {
    const forward = computeStatistics([observation(0, 10), observation(1, 14), observation(2, 12)]);
    const shuffled = computeStatistics([
      observation(2, 12),
      observation(0, 10),
      observation(1, 14),
    ]);

    expect(shuffled).toEqual(forward);
  });

  it("rounds every derived figure to the package precision", () => {
    const stats = computeStatistics([
      observation(0, 1 / 3),
      observation(1, 2 / 3),
      observation(2, 1),
      observation(3, 4 / 3),
    ]);

    for (const value of [stats.mean, stats.standardDeviation, stats.meanAbsoluteChange]) {
      expect(value).toBe(Number(value.toFixed(6)));
    }
  });

  it("handles negative values without confusing the extremes", () => {
    const stats = computeStatistics([observation(0, -5), observation(1, -1), observation(2, -9)]);

    expect(stats.min).toBe(-9);
    expect(stats.max).toBe(-1);
    expect(stats.mean).toBe(-5);
  });
});

describe("maxHoldoutSize", () => {
  it("is zero when the series cannot spare anything above the training floor", () => {
    expect(maxHoldoutSize(4)).toBe(0);
    expect(maxHoldoutSize(3)).toBe(0);
    expect(maxHoldoutSize(0)).toBe(0);
  });

  it("is bounded by the training floor on a short series", () => {
    expect(maxHoldoutSize(6)).toBe(2);
    expect(maxHoldoutSize(7)).toBe(3);
  });

  it("is bounded by the horizon ceiling on a long series", () => {
    expect(maxHoldoutSize(24)).toBe(12);
    expect(maxHoldoutSize(100)).toBe(50);
  });
});

describe("splitHoldout", () => {
  const twelve = Array.from({ length: 12 }, (_, index) => observation(index, index * 2));

  it("splits chronologically, never randomly", () => {
    const split = splitHoldout(twelve, 3);

    expect(split.train.map((entry) => entry.period)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(split.holdout.map((entry) => entry.period)).toEqual([9, 10, 11]);
  });

  it("clamps an over-large request to the largest honest split", () => {
    const split = splitHoldout(twelve, 99);

    expect(split.holdout).toHaveLength(maxHoldoutSize(12));
    expect(split.train.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps the training set above the observation floor on a short series", () => {
    const six = Array.from({ length: 6 }, (_, index) => observation(index, index));
    const split = splitHoldout(six, 5);

    expect(split.train).toHaveLength(4);
    expect(split.holdout).toHaveLength(2);
  });

  it("yields an empty holdout when the series is too short to split", () => {
    const four = Array.from({ length: 4 }, (_, index) => observation(index, index));
    const split = splitHoldout(four, 2);

    expect(split.holdout).toEqual([]);
    expect(split.train).toHaveLength(4);
  });

  it("treats a zero or negative request as no backtest", () => {
    expect(splitHoldout(twelve, 0).holdout).toEqual([]);
    expect(splitHoldout(twelve, -4).holdout).toEqual([]);
  });

  it("treats a fractional request as zero rather than rounding it", () => {
    expect(splitHoldout(twelve, 2.5).holdout).toEqual([]);
  });

  it("sorts before splitting so an unordered input still splits chronologically", () => {
    const split = splitHoldout([...twelve].reverse(), 2);

    expect(split.holdout.map((entry) => entry.period)).toEqual([10, 11]);
  });

  it("loses no observation across the split", () => {
    const split = splitHoldout(twelve, 4);

    expect(split.train.length + split.holdout.length).toBe(twelve.length);
  });
});
