import { describe, expect, it } from "vitest";

import type {
  FittedPoint,
  ForecastPoint,
  ProjectionPoint,
  ResidualStatistics,
  ScoredPoint,
  SeriesInspection,
  SeriesStatistics,
  UncertaintyInput,
} from "./forecast-view";
import { CONFIDENCE_MULTIPLIERS, REQUIRED_CONFIDENCE_LEVEL, roundValue } from "./forecast-value";
import {
  MIN_RESIDUALS_FOR_STABLE_SPREAD,
  assessUncertainty,
  attachIntervals,
  buildIntervals,
  computeCoverage,
  horizonWidening,
  judgeCalibration,
  labelsOf,
  spreadFor,
  summarizeResiduals,
} from "./uncertainty";

const fittedPoint = (period: number, actual: number, fitted: number): FittedPoint => ({
  period,
  actual,
  fitted,
  residual: roundValue(actual - fitted),
});

const residuals = (overrides: Partial<ResidualStatistics> = {}): ResidualStatistics => ({
  sampleSize: 11,
  meanAbsoluteError: 4,
  rootMeanSquaredError: 5,
  standardDeviation: 5,
  ...overrides,
});

const inspection = (overrides: Partial<SeriesInspection> = {}): SeriesInspection => ({
  seriesKey: "fees.collection_rate",
  count: 12,
  firstPeriod: 0,
  lastPeriod: 11,
  contiguousSpan: 12,
  gapPeriods: [],
  completeCycles: 0,
  forecastable: true,
  issues: [],
  ...overrides,
});

const statistics = (overrides: Partial<SeriesStatistics> = {}): SeriesStatistics => ({
  count: 12,
  mean: 100,
  min: 90,
  max: 110,
  standardDeviation: 5,
  meanAbsoluteChange: 4,
  ...overrides,
});

const forecastPoint = (value: number, intervalWidth: number): ForecastPoint => ({
  period: 12,
  horizon: 1,
  label: "P12",
  value,
  intervals: [
    {
      level: REQUIRED_CONFIDENCE_LEVEL,
      lower: value - intervalWidth / 2,
      upper: value + intervalWidth / 2,
    },
  ],
  intervalWidth,
});

const input = (overrides: Partial<UncertaintyInput> = {}): UncertaintyInput => ({
  method: "linear_trend",
  inspection: inspection(),
  statistics: statistics(),
  residuals: residuals(),
  horizon: 2,
  points: [forecastPoint(100, 5)],
  ...overrides,
});

describe("summarizeResiduals", () => {
  it("returns zeros for a method that fitted nothing", () => {
    expect(summarizeResiduals([])).toEqual({
      sampleSize: 0,
      meanAbsoluteError: 0,
      rootMeanSquaredError: 0,
      standardDeviation: 0,
    });
  });

  it("computes the error measures over the residuals", () => {
    const summary = summarizeResiduals([
      fittedPoint(1, 12, 10),
      fittedPoint(2, 14, 12),
      fittedPoint(3, 16, 14),
    ]);

    expect(summary.sampleSize).toBe(3);
    expect(summary.meanAbsoluteError).toBe(2);
    expect(summary.rootMeanSquaredError).toBe(2);
    expect(summary.standardDeviation).toBe(0);
  });

  it("counts a consistent bias in the RMSE while the standard deviation forgives it", () => {
    const biased = summarizeResiduals([
      fittedPoint(1, 11, 10),
      fittedPoint(2, 12, 11),
      fittedPoint(3, 13, 12),
      fittedPoint(4, 14, 13),
    ]);

    expect(biased.rootMeanSquaredError).toBe(1);
    expect(biased.standardDeviation).toBe(0);
  });

  it("treats over- and under-shoots alike in the absolute and squared measures", () => {
    const summary = summarizeResiduals([
      fittedPoint(1, 8, 10),
      fittedPoint(2, 12, 10),
      fittedPoint(3, 10, 10),
    ]);

    expect(summary.meanAbsoluteError).toBe(roundValue(4 / 3));
    expect(summary.rootMeanSquaredError).toBe(roundValue(Math.sqrt(8 / 3)));
  });

  it("rounds every measure to the package precision", () => {
    const summary = summarizeResiduals([
      fittedPoint(1, 10 / 3, 0),
      fittedPoint(2, 1, 0),
      fittedPoint(3, 2, 0),
    ]);

    for (const value of [
      summary.meanAbsoluteError,
      summary.rootMeanSquaredError,
      summary.standardDeviation,
    ]) {
      expect(value).toBe(Number(value.toFixed(6)));
    }
  });
});

describe("spreadFor", () => {
  it("uses the measured RMSE when there are enough residuals to trust it", () => {
    expect(spreadFor(residuals({ sampleSize: MIN_RESIDUALS_FOR_STABLE_SPREAD }), 99)).toBe(5);
  });

  it("falls back to the series movement when the method fitted nothing at all", () => {
    expect(spreadFor(residuals({ sampleSize: 0, rootMeanSquaredError: 0 }), 4)).toBe(4);
  });

  it("takes the wider of the two when the residual sample is too small to trust", () => {
    expect(spreadFor(residuals({ sampleSize: 2, rootMeanSquaredError: 9 }), 4)).toBe(9);
    expect(spreadFor(residuals({ sampleSize: 2, rootMeanSquaredError: 1 }), 4)).toBe(4);
  });

  it("never returns a negative spread", () => {
    expect(spreadFor(residuals({ sampleSize: 0, rootMeanSquaredError: 0 }), -7)).toBe(7);
  });

  it("falls back when a large sample somehow measured no error at all", () => {
    expect(spreadFor(residuals({ sampleSize: 40, rootMeanSquaredError: 0 }), 3)).toBe(3);
  });
});

describe("horizonWidening", () => {
  it("does not widen the first period", () => {
    expect(horizonWidening(1)).toBe(1);
  });

  it("widens with the square root of the horizon", () => {
    expect(horizonWidening(4)).toBe(2);
    expect(horizonWidening(9)).toBe(3);
  });

  it("never narrows, whatever it is given", () => {
    expect(horizonWidening(0)).toBe(1);
    expect(horizonWidening(-5)).toBe(1);
  });

  it("is monotonic across a realistic horizon range", () => {
    for (let horizon = 1; horizon < 24; horizon += 1) {
      expect(horizonWidening(horizon + 1)).toBeGreaterThanOrEqual(horizonWidening(horizon));
    }
  });
});

describe("buildIntervals", () => {
  it("always includes the required level, even when none is asked for", () => {
    const intervals = buildIntervals(100, 1, 10);

    expect(intervals.map((interval) => interval.level)).toEqual([REQUIRED_CONFIDENCE_LEVEL]);
  });

  it("always includes the required level, even when others are asked for", () => {
    const intervals = buildIntervals(100, 1, 10, [50]);

    expect(intervals.map((interval) => interval.level)).toEqual([50, REQUIRED_CONFIDENCE_LEVEL]);
  });

  it("orders levels ascending and de-duplicates a repeated request", () => {
    const intervals = buildIntervals(100, 1, 10, [95, 50, 95, 80]);

    expect(intervals.map((interval) => interval.level)).toEqual([50, 80, 95]);
  });

  it("centres the interval on the projected value", () => {
    const interval = buildIntervals(100, 1, 10)[0];

    expect(interval?.lower).toBe(roundValue(100 - CONFIDENCE_MULTIPLIERS[80] * 10));
    expect(interval?.upper).toBe(roundValue(100 + CONFIDENCE_MULTIPLIERS[80] * 10));
  });

  it("widens with the horizon", () => {
    const near = buildIntervals(100, 1, 10)[0];
    const far = buildIntervals(100, 4, 10)[0];

    expect((far?.upper ?? 0) - (far?.lower ?? 0)).toBeCloseTo(
      2 * ((near?.upper ?? 0) - (near?.lower ?? 0)),
      6,
    );
  });

  it("nests the levels, so a higher confidence is never narrower", () => {
    const intervals = buildIntervals(100, 3, 10, [50, 80, 95]);

    for (let index = 1; index < intervals.length; index += 1) {
      expect(intervals[index]?.lower ?? 0).toBeLessThanOrEqual(intervals[index - 1]?.lower ?? 0);
      expect(intervals[index]?.upper ?? 0).toBeGreaterThanOrEqual(intervals[index - 1]?.upper ?? 0);
    }
  });

  it("collapses to a point interval at zero spread without inverting it", () => {
    const interval = buildIntervals(100, 4, 0)[0];

    expect(interval?.lower).toBe(100);
    expect(interval?.upper).toBe(100);
  });

  it("treats a negative spread as its magnitude rather than inverting the interval", () => {
    expect(buildIntervals(100, 1, -10)).toEqual(buildIntervals(100, 1, 10));
  });

  it("rounds both bounds to the package precision", () => {
    for (const interval of buildIntervals(1 / 3, 3, 1 / 7, [50, 95])) {
      expect(interval.lower).toBe(Number(interval.lower.toFixed(6)));
      expect(interval.upper).toBe(Number(interval.upper.toFixed(6)));
    }
  });
});

describe("attachIntervals", () => {
  const projections: readonly ProjectionPoint[] = [
    { period: 12, horizon: 1, value: 100 },
    { period: 13, horizon: 2, value: 102 },
  ];

  it("gives every point an interval at the required level", () => {
    const points = attachIntervals(projections, 10);

    for (const point of points) {
      expect(point.intervals.some((interval) => interval.level === REQUIRED_CONFIDENCE_LEVEL)).toBe(
        true,
      );
    }
  });

  it("hoists the required interval's width onto the point", () => {
    const point = attachIntervals(projections, 10)[0];

    expect(point?.intervalWidth).toBe(roundValue(2 * CONFIDENCE_MULTIPLIERS[80] * 10));
  });

  it("widens the further point", () => {
    const points = attachIntervals(projections, 10);

    expect(points[1]?.intervalWidth ?? 0).toBeGreaterThan(points[0]?.intervalWidth ?? 0);
  });

  it("takes labels from the lookup when one is supplied", () => {
    const points = attachIntervals(projections, 10, [], new Map([[12, "Term 1 2027"]]));

    expect(points[0]?.label).toBe("Term 1 2027");
  });

  it("renders the period plainly when no label is known", () => {
    expect(attachIntervals(projections, 10)[1]?.label).toBe("P13");
  });

  it("carries the projected value through untouched", () => {
    expect(attachIntervals(projections, 10).map((point) => point.value)).toEqual([100, 102]);
  });

  it("returns nothing for nothing", () => {
    expect(attachIntervals([], 10)).toEqual([]);
  });
});

describe("labelsOf", () => {
  it("keys the history's labels by period", () => {
    const labels = labelsOf([
      { period: 0, value: 1, label: "2026-01" },
      { period: 1, value: 2, label: "2026-02" },
    ]);

    expect(labels.get(1)).toBe("2026-02");
    expect(labels.size).toBe(2);
  });
});

describe("assessUncertainty", () => {
  it("grades a long, regular, stable, near-horizon forecast as tight with no reasons", () => {
    const assessment = assessUncertainty(input());

    expect(assessment.grade).toBe("tight");
    expect(assessment.reasons).toEqual([]);
    expect(assessment.relativeWidth).toBe(0.05);
    expect(assessment.maxHorizon).toBe(6);
  });

  it("grades by relative width across the thresholds", () => {
    expect(assessUncertainty(input({ points: [forecastPoint(100, 20)] })).grade).toBe("moderate");
    expect(assessUncertainty(input({ points: [forecastPoint(100, 40)] })).grade).toBe("wide");
    expect(assessUncertainty(input({ points: [forecastPoint(100, 80)] })).grade).toBe("unusable");
  });

  it("grades from the furthest point, which is the widest", () => {
    const assessment = assessUncertainty(
      input({ points: [forecastPoint(100, 5), forecastPoint(100, 80)] }),
    );

    expect(assessment.grade).toBe("unusable");
  });

  it("cannot claim tightness about a level of zero", () => {
    const assessment = assessUncertainty(input({ points: [forecastPoint(0, 1)] }));

    expect(assessment.relativeWidth).toBeNull();
    expect(assessment.grade).toBe("wide");
  });

  it("scales the relative width by magnitude, not sign", () => {
    const assessment = assessUncertainty(input({ points: [forecastPoint(-100, 5)] }));

    expect(assessment.relativeWidth).toBe(0.05);
  });

  it("escalates a short history to at least moderate", () => {
    const assessment = assessUncertainty(input({ inspection: inspection({ count: 6 }) }));

    expect(assessment.reasons).toContain("short_history");
    expect(assessment.grade).toBe("moderate");
  });

  it("escalates a lightly gappy history to at least moderate", () => {
    const assessment = assessUncertainty(
      input({ inspection: inspection({ gapPeriods: [3], contiguousSpan: 13 }) }),
    );

    expect(assessment.reasons).toContain("sparse_history");
    expect(assessment.grade).toBe("moderate");
  });

  it("escalates a badly gappy history to at least wide", () => {
    const assessment = assessUncertainty(
      input({ inspection: inspection({ gapPeriods: [3, 4, 5, 6, 7], contiguousSpan: 17 }) }),
    );

    expect(assessment.reasons).toContain("sparse_history");
    expect(assessment.grade).toBe("wide");
  });

  it("escalates a volatile history to at least wide", () => {
    const assessment = assessUncertainty(
      input({ statistics: statistics({ mean: 100, standardDeviation: 60 }) }),
    );

    expect(assessment.reasons).toContain("volatile_history");
    expect(assessment.grade).toBe("wide");
  });

  it("does not call a series volatile when its mean is zero and the ratio is undefined", () => {
    const assessment = assessUncertainty(
      input({ statistics: statistics({ mean: 0, standardDeviation: 60 }) }),
    );

    expect(assessment.reasons).not.toContain("volatile_history");
  });

  it("escalates a horizon in the upper half of the admissible band to at least moderate", () => {
    const assessment = assessUncertainty(input({ horizon: 5 }));

    expect(assessment.reasons).toContain("long_horizon");
    expect(assessment.grade).toBe("moderate");
  });

  it("does not call a horizon long when it sits in the lower half of the band", () => {
    expect(assessUncertainty(input({ horizon: 3 })).reasons).not.toContain("long_horizon");
  });

  it("escalates too few residuals to at least wide", () => {
    const assessment = assessUncertainty(input({ residuals: residuals({ sampleSize: 2 }) }));

    expect(assessment.reasons).toContain("unstable_residuals");
    expect(assessment.grade).toBe("wide");
  });

  it("escalates a seasonal method without whole cycles to at least wide", () => {
    const assessment = assessUncertainty(
      input({ method: "seasonal_naive", inspection: inspection({ completeCycles: 1 }) }),
    );

    expect(assessment.reasons).toContain("seasonal_cycle_incomplete");
    expect(assessment.grade).toBe("wide");
  });

  it("does not raise a seasonal reason for a non-seasonal method", () => {
    const assessment = assessUncertainty(
      input({ method: "drift", inspection: inspection({ completeCycles: 0 }) }),
    );

    expect(assessment.reasons).not.toContain("seasonal_cycle_incomplete");
  });

  it("takes the worst floor rather than averaging the reasons away", () => {
    const assessment = assessUncertainty(
      input({
        inspection: inspection({ count: 6 }),
        residuals: residuals({ sampleSize: 1 }),
        points: [forecastPoint(100, 5)],
      }),
    );

    expect(assessment.grade).toBe("wide");
  });

  it("never lets a tight width offset a reason that demands worse", () => {
    const tight = assessUncertainty(input({ points: [forecastPoint(100, 1)] })).grade;
    const tightButShort = assessUncertainty(
      input({ points: [forecastPoint(100, 1)], inspection: inspection({ count: 5 }) }),
    ).grade;

    expect(tight).toBe("tight");
    expect(tightButShort).toBe("moderate");
  });

  it("reports a reason even when it did not move the grade", () => {
    const assessment = assessUncertainty(input({ horizon: 5, points: [forecastPoint(100, 80)] }));

    expect(assessment.grade).toBe("unusable");
    expect(assessment.reasons).toContain("long_horizon");
  });

  it("sorts and de-duplicates its reasons", () => {
    const assessment = assessUncertainty(
      input({
        method: "seasonal_naive",
        inspection: inspection({ count: 5, gapPeriods: [2], contiguousSpan: 6, completeCycles: 0 }),
        statistics: statistics({ mean: 10, standardDeviation: 9 }),
        residuals: residuals({ sampleSize: 1 }),
        horizon: 2,
      }),
    );

    expect(assessment.reasons).toEqual([
      "long_horizon",
      "seasonal_cycle_incomplete",
      "short_history",
      "sparse_history",
      "unstable_residuals",
      "volatile_history",
    ]);
    expect(new Set(assessment.reasons).size).toBe(assessment.reasons.length);
  });

  it("stops escalating at wide, because only the width itself can call a forecast unusable", () => {
    const everythingWrong = assessUncertainty(
      input({
        method: "seasonal_naive",
        inspection: inspection({ count: 5, gapPeriods: [2, 3, 4], contiguousSpan: 6 }),
        statistics: statistics({ mean: 10, standardDeviation: 9 }),
        residuals: residuals({ sampleSize: 1 }),
        horizon: 2,
        points: [forecastPoint(100, 1)],
      }),
    );

    expect(everythingWrong.reasons.length).toBe(6);
    expect(everythingWrong.grade).toBe("wide");
  });

  it("carries the residual statistics through unchanged", () => {
    const given = residuals({ sampleSize: 9 });

    expect(assessUncertainty(input({ residuals: given })).residuals).toEqual(given);
  });

  it("reports a max horizon of zero for a series below the observation floor", () => {
    const assessment = assessUncertainty(input({ inspection: inspection({ count: 3 }) }));

    expect(assessment.maxHorizon).toBe(0);
    expect(assessment.reasons).not.toContain("long_horizon");
  });

  it("handles an empty point set without inventing a width", () => {
    const assessment = assessUncertainty(input({ points: [] }));

    expect(assessment.relativeWidth).toBeNull();
    expect(assessment.grade).toBe("wide");
  });
});

describe("computeCoverage", () => {
  const scored = (actual: number, lower: number, upper: number): ScoredPoint => ({
    period: 1,
    horizon: 1,
    forecast: (lower + upper) / 2,
    actual,
    intervals: [{ level: REQUIRED_CONFIDENCE_LEVEL, lower, upper }],
  });

  it("counts an actual inside the interval as covered", () => {
    expect(computeCoverage([scored(100, 90, 110)])).toEqual({ coverage: 100, sampleSize: 1 });
  });

  it("counts an actual outside the interval as a miss", () => {
    expect(computeCoverage([scored(120, 90, 110)])).toEqual({ coverage: 0, sampleSize: 1 });
  });

  it("counts the bounds themselves as covered", () => {
    expect(computeCoverage([scored(90, 90, 110), scored(110, 90, 110)]).coverage).toBe(100);
  });

  it("reports the fraction as a percentage", () => {
    const points = [
      scored(100, 90, 110),
      scored(120, 90, 110),
      scored(95, 90, 110),
      scored(80, 90, 110),
    ];

    expect(computeCoverage(points).coverage).toBe(50);
  });

  it("skips points carrying no interval at the requested level rather than counting them as misses", () => {
    const points = [scored(100, 90, 110), { ...scored(100, 90, 110), intervals: [] }];
    const result = computeCoverage(points);

    expect(result.sampleSize).toBe(1);
    expect(result.coverage).toBe(100);
  });

  it("reports zero coverage over an empty sample rather than dividing by nothing", () => {
    expect(computeCoverage([])).toEqual({ coverage: 0, sampleSize: 0 });
  });

  it("reads the level it was asked for", () => {
    const point: ScoredPoint = {
      period: 1,
      horizon: 1,
      forecast: 100,
      actual: 115,
      intervals: [
        { level: 80, lower: 90, upper: 110 },
        { level: 95, lower: 80, upper: 120 },
      ],
    };

    expect(computeCoverage([point], 80).coverage).toBe(0);
    expect(computeCoverage([point], 95).coverage).toBe(100);
  });
});

describe("judgeCalibration", () => {
  it("calls an interval calibrated when coverage lands near the level it claimed", () => {
    expect(judgeCalibration(80)).toBe("calibrated");
    expect(judgeCalibration(70)).toBe("calibrated");
    expect(judgeCalibration(90)).toBe("calibrated");
  });

  it("calls an interval overconfident when it caught fewer outcomes than claimed", () => {
    expect(judgeCalibration(69)).toBe("overconfident");
    expect(judgeCalibration(40)).toBe("overconfident");
  });

  it("calls an interval underconfident when it caught more than it needed to", () => {
    expect(judgeCalibration(91)).toBe("underconfident");
    expect(judgeCalibration(100)).toBe("underconfident");
  });

  it("judges against the level it was asked about", () => {
    expect(judgeCalibration(60, 50)).toBe("calibrated");
    expect(judgeCalibration(60, 95)).toBe("overconfident");
  });
});
