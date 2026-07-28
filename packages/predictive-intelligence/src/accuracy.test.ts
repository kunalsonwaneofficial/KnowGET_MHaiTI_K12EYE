import { describe, expect, it } from "vitest";

import type { ForecastPoint, Observation, ScoredPoint } from "./forecast-view";
import { REQUIRED_CONFIDENCE_LEVEL, roundValue } from "./forecast-value";
import {
  computeAccuracy,
  isPublishable,
  meanAbsoluteError,
  meanAbsolutePercentageError,
  rootMeanSquaredError,
  scoreAgainstActuals,
  skillScore,
} from "./accuracy";

const forecastPoint = (period: number, value: number, halfWidth = 5): ForecastPoint => ({
  period,
  horizon: period - 11,
  label: `P${period}`,
  value,
  intervals: [
    { level: REQUIRED_CONFIDENCE_LEVEL, lower: value - halfWidth, upper: value + halfWidth },
  ],
  intervalWidth: halfWidth * 2,
});

const actual = (period: number, value: number): Observation => ({
  period,
  value,
  label: `P${period}`,
});

const scoredPoint = (
  period: number,
  forecast: number,
  act: number,
  halfWidth = 5,
): ScoredPoint => ({
  period,
  horizon: period - 11,
  forecast,
  actual: act,
  intervals: [
    { level: REQUIRED_CONFIDENCE_LEVEL, lower: forecast - halfWidth, upper: forecast + halfWidth },
  ],
});

describe("scoreAgainstActuals", () => {
  it("pairs each forecast with the actual for its own period", () => {
    const scored = scoreAgainstActuals(
      [forecastPoint(12, 100), forecastPoint(13, 110)],
      [actual(12, 104), actual(13, 108)],
    );

    expect(scored.map((point) => [point.period, point.forecast, point.actual])).toEqual([
      [12, 100, 104],
      [13, 110, 108],
    ]);
  });

  it("matches on period rather than position, so a shuffled holdout still scores correctly", () => {
    const scored = scoreAgainstActuals(
      [forecastPoint(12, 100), forecastPoint(13, 110)],
      [actual(13, 108), actual(12, 104)],
    );

    expect(scored.map((point) => point.actual)).toEqual([104, 108]);
  });

  it("drops a forecast period nobody observed", () => {
    const scored = scoreAgainstActuals(
      [forecastPoint(12, 100), forecastPoint(13, 110), forecastPoint(14, 120)],
      [actual(12, 104), actual(14, 118)],
    );

    expect(scored.map((point) => point.period)).toEqual([12, 14]);
  });

  it("ignores an actual for a period nobody forecast", () => {
    const scored = scoreAgainstActuals([forecastPoint(12, 100)], [actual(11, 90), actual(12, 104)]);

    expect(scored.length).toBe(1);
  });

  it("returns the pairs in period order", () => {
    const scored = scoreAgainstActuals(
      [forecastPoint(14, 120), forecastPoint(12, 100), forecastPoint(13, 110)],
      [actual(12, 1), actual(13, 2), actual(14, 3)],
    );

    expect(scored.map((point) => point.period)).toEqual([12, 13, 14]);
  });

  it("carries the intervals through, so coverage can still be measured", () => {
    const scored = scoreAgainstActuals([forecastPoint(12, 100, 7)], [actual(12, 104)]);

    expect(scored[0]?.intervals).toEqual([{ level: 80, lower: 93, upper: 107 }]);
  });

  it("scores nothing from an empty holdout", () => {
    expect(scoreAgainstActuals([forecastPoint(12, 100)], [])).toEqual([]);
  });
});

describe("meanAbsoluteError", () => {
  it("averages the absolute misses", () => {
    expect(meanAbsoluteError([scoredPoint(12, 100, 104), scoredPoint(13, 110, 108)])).toBe(3);
  });

  it("treats an overshoot and an undershoot alike", () => {
    expect(meanAbsoluteError([scoredPoint(12, 100, 90), scoredPoint(13, 100, 110)])).toBe(10);
  });

  it("is zero for a holdout with nothing in it", () => {
    expect(meanAbsoluteError([])).toBe(0);
  });
});

describe("rootMeanSquaredError", () => {
  it("punishes the large miss more than the mean absolute error does", () => {
    const spread = [scoredPoint(12, 100, 100), scoredPoint(13, 100, 120)];

    expect(meanAbsoluteError(spread)).toBe(10);
    expect(rootMeanSquaredError(spread)).toBe(roundValue(Math.sqrt(200)));
  });

  it("matches the mean absolute error when every miss is the same size", () => {
    const even = [scoredPoint(12, 100, 105), scoredPoint(13, 100, 95)];

    expect(rootMeanSquaredError(even)).toBe(meanAbsoluteError(even));
  });

  it("is zero for a holdout with nothing in it", () => {
    expect(rootMeanSquaredError([])).toBe(0);
  });
});

describe("meanAbsolutePercentageError", () => {
  it("reports the average miss as a percentage of what happened", () => {
    expect(meanAbsolutePercentageError([scoredPoint(12, 110, 100)])).toBe(10);
  });

  it("declines to answer where an actual was zero", () => {
    expect(
      meanAbsolutePercentageError([scoredPoint(12, 110, 100), scoredPoint(13, 5, 0)]),
    ).toBeNull();
  });

  it("declines to answer for an empty holdout", () => {
    expect(meanAbsolutePercentageError([])).toBeNull();
  });

  it("handles a negative actual by magnitude", () => {
    expect(meanAbsolutePercentageError([scoredPoint(12, -110, -100)])).toBe(10);
  });
});

describe("skillScore", () => {
  it("is positive where the model beat doing nothing", () => {
    expect(skillScore(4, 10)).toBe(0.6);
  });

  it("is zero where the model merely matched doing nothing", () => {
    expect(skillScore(10, 10)).toBe(0);
  });

  it("is negative where the institution would have done better with no model", () => {
    expect(skillScore(30, 10)).toBe(-2);
  });

  it("does not clamp a badly negative score into looking harmless", () => {
    expect(skillScore(100, 10)).toBe(-9);
  });

  it("reports no skill where both the model and the baseline were perfect", () => {
    expect(skillScore(0, 0)).toBe(0);
  });

  it("reports the worst standing where the baseline was perfect and the model was not", () => {
    expect(skillScore(3, 0)).toBe(-1);
  });
});

describe("computeAccuracy", () => {
  const scored = [scoredPoint(12, 100, 104), scoredPoint(13, 110, 108), scoredPoint(14, 120, 121)];
  const baseline = [scoredPoint(12, 96, 104), scoredPoint(13, 96, 108), scoredPoint(14, 96, 121)];

  it("reports the sample it actually scored", () => {
    expect(computeAccuracy(scored, baseline).sampleSize).toBe(3);
  });

  it("scores skill against the baseline it was given", () => {
    const scores = computeAccuracy(scored, baseline);

    expect(scores.meanAbsoluteError).toBe(roundValue(7 / 3));
    expect(scores.skillScore).toBe(
      skillScore(scores.meanAbsoluteError, meanAbsoluteError(baseline)),
    );
    expect(scores.skillScore).toBeGreaterThan(0);
  });

  it("reports no skill rather than good skill when no baseline was supplied", () => {
    expect(computeAccuracy(scored).skillScore).toBe(0);
  });

  it("measures coverage at the level every forecast must carry", () => {
    const scores = computeAccuracy(scored, baseline);

    expect(scores.coverageLevel).toBe(REQUIRED_CONFIDENCE_LEVEL);
    expect(scores.intervalCoverage).toBe(100);
    expect(scores.calibration).toBe("underconfident");
  });

  it("calls a model overconfident when its intervals caught far too little", () => {
    const missed = [
      scoredPoint(12, 100, 140, 1),
      scoredPoint(13, 100, 140, 1),
      scoredPoint(14, 100, 140, 1),
    ];

    expect(computeAccuracy(missed).calibration).toBe("overconfident");
    expect(computeAccuracy(missed).intervalCoverage).toBe(0);
  });

  it("calls an interval calibrated when it caught close to what it claimed", () => {
    const scores = computeAccuracy([
      scoredPoint(12, 100, 102),
      scoredPoint(13, 100, 102),
      scoredPoint(14, 100, 102),
      scoredPoint(15, 100, 102),
      scoredPoint(16, 100, 140),
    ]);

    expect(scores.intervalCoverage).toBe(80);
    expect(scores.calibration).toBe("calibrated");
  });

  it("records a holdout that could not be scored rather than inventing a verdict", () => {
    const scores = computeAccuracy([]);

    expect(scores.sampleSize).toBe(0);
    expect(scores.meanAbsoluteError).toBe(0);
    expect(scores.meanAbsolutePercentageError).toBeNull();
    expect(scores.skillScore).toBe(0);
    expect(scores.calibration).toBe("calibrated");
  });

  it("leaves the percentage error out where an actual was zero", () => {
    expect(computeAccuracy([scoredPoint(12, 5, 0)]).meanAbsolutePercentageError).toBeNull();
  });

  it("does not convict a model of overconfidence on an absence of evidence", () => {
    const noIntervalsAtThisLevel: ScoredPoint[] = [
      {
        period: 12,
        horizon: 1,
        forecast: 100,
        actual: 130,
        intervals: [{ level: 50, lower: 99, upper: 101 }],
      },
    ];
    const scores = computeAccuracy(noIntervalsAtThisLevel);

    expect(scores.sampleSize).toBe(1);
    expect(scores.intervalCoverage).toBe(0);
    expect(scores.calibration).toBe("calibrated");
  });

  it("measures coverage at another level when explicitly asked", () => {
    const wider: ScoredPoint[] = [
      {
        period: 12,
        horizon: 1,
        forecast: 100,
        actual: 130,
        intervals: [
          { level: 80, lower: 95, upper: 105 },
          { level: 95, lower: 60, upper: 140 },
        ],
      },
    ];

    expect(computeAccuracy(wider, [], 95).intervalCoverage).toBe(100);
    expect(computeAccuracy(wider, [], 80).intervalCoverage).toBe(0);
  });
});

describe("isPublishable", () => {
  const scores = (overrides: Partial<ReturnType<typeof computeAccuracy>> = {}) => ({
    ...computeAccuracy(
      [scoredPoint(12, 100, 101), scoredPoint(13, 110, 111)],
      [scoredPoint(12, 90, 101), scoredPoint(13, 90, 111)],
    ),
    ...overrides,
  });

  it("passes a model that beat the baseline with honest intervals", () => {
    expect(isPublishable(scores())).toBe(true);
  });

  it("refuses a model that could not beat doing nothing", () => {
    expect(isPublishable(scores({ skillScore: 0 }))).toBe(false);
    expect(isPublishable(scores({ skillScore: -0.2 }))).toBe(false);
  });

  it("refuses a skilful model whose intervals were a comfortable lie", () => {
    expect(isPublishable(scores({ calibration: "overconfident" }))).toBe(false);
  });

  it("does not disqualify a model merely for being cautious", () => {
    expect(isPublishable(scores({ calibration: "underconfident" }))).toBe(true);
  });

  it("refuses a model with no evidence at all", () => {
    expect(isPublishable(computeAccuracy([]))).toBe(false);
    expect(isPublishable(scores({ sampleSize: 0 }))).toBe(false);
  });
});
