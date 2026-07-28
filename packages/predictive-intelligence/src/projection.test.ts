import { describe, expect, it } from "vitest";

import type { Observation } from "./forecast-view";
import { FORECAST_METHODS } from "./forecast-value";
import {
  DEFAULT_ALPHA,
  DEFAULT_WINDOW_SIZE,
  fitLinearTrend,
  project,
  projectBaseline,
  requiredCycleFor,
  resolveParameters,
} from "./projection";

const observation = (period: number, value: number): Observation => ({
  period,
  value,
  label: `P${String(period)}`,
});

/** A clean, contiguous, perfectly linear series: 10, 12, 14, 16 over periods 0–3. */
const linear: readonly Observation[] = [
  observation(0, 10),
  observation(1, 12),
  observation(2, 14),
  observation(3, 16),
];

/** Two whole four-period cycles with a clear seasonal shape and a mild upward drift. */
const seasonal: readonly Observation[] = [
  observation(0, 10),
  observation(1, 20),
  observation(2, 30),
  observation(3, 40),
  observation(4, 11),
  observation(5, 21),
  observation(6, 31),
  observation(7, 41),
];

describe("resolveParameters", () => {
  it("applies the documented defaults when nothing is declared", () => {
    expect(resolveParameters({}, 12)).toEqual({
      windowSize: DEFAULT_WINDOW_SIZE,
      alpha: DEFAULT_ALPHA,
    });
  });

  it("shrinks the default window to what a very short series can support", () => {
    expect(resolveParameters({}, 2).windowSize).toBe(2);
  });

  it("keeps a declared window that the series can support", () => {
    expect(resolveParameters({ windowSize: 6 }, 12).windowSize).toBe(6);
  });

  it("clamps an over-large window rather than failing the run", () => {
    expect(resolveParameters({ windowSize: 12 }, 9).windowSize).toBe(9);
  });

  it("falls back to the default for a nonsensical window", () => {
    expect(resolveParameters({ windowSize: 0 }, 12).windowSize).toBe(DEFAULT_WINDOW_SIZE);
    expect(resolveParameters({ windowSize: -3 }, 12).windowSize).toBe(DEFAULT_WINDOW_SIZE);
    expect(resolveParameters({ windowSize: 2.5 }, 12).windowSize).toBe(DEFAULT_WINDOW_SIZE);
  });

  it("keeps a declared alpha inside the open-closed unit interval", () => {
    expect(resolveParameters({ alpha: 0.75 }, 12).alpha).toBe(0.75);
    expect(resolveParameters({ alpha: 1 }, 12).alpha).toBe(1);
  });

  it("falls back to the default for an alpha outside the interval", () => {
    expect(resolveParameters({ alpha: 0 }, 12).alpha).toBe(DEFAULT_ALPHA);
    expect(resolveParameters({ alpha: 1.5 }, 12).alpha).toBe(DEFAULT_ALPHA);
    expect(resolveParameters({ alpha: Number.NaN }, 12).alpha).toBe(DEFAULT_ALPHA);
  });

  it("never resolves a window below one, even for an empty series", () => {
    expect(resolveParameters({}, 0).windowSize).toBe(1);
  });
});

describe("fitLinearTrend", () => {
  it("recovers an exact line", () => {
    expect(fitLinearTrend(linear)).toEqual({ slope: 2, intercept: 10 });
  });

  it("returns a flat fit when there is no spread in the periods to regress on", () => {
    expect(fitLinearTrend([observation(3, 10)])).toEqual({ slope: 0, intercept: 10 });
  });

  it("returns zeros for an empty series", () => {
    expect(fitLinearTrend([])).toEqual({ slope: 0, intercept: 0 });
  });
});

describe("project — the grid", () => {
  it("projects contiguously from the last observed period", () => {
    const result = project("naive", linear, 3);

    expect(result.points.map((point) => point.period)).toEqual([4, 5, 6]);
    expect(result.points.map((point) => point.horizon)).toEqual([1, 2, 3]);
  });

  it("projects from the last period even when the history behind it has gaps", () => {
    const gappy = [observation(0, 10), observation(1, 12), observation(5, 20)];
    const result = project("naive", gappy, 2);

    expect(result.points.map((point) => point.period)).toEqual([6, 7]);
  });

  it("returns an empty result for an empty series rather than throwing", () => {
    const result = project("linear_trend", [], 3);

    expect(result.points).toEqual([]);
    expect(result.fitted).toEqual([]);
  });

  it("returns an empty result for a non-positive or fractional horizon", () => {
    expect(project("naive", linear, 0).points).toEqual([]);
    expect(project("naive", linear, -2).points).toEqual([]);
    expect(project("naive", linear, 1.5).points).toEqual([]);
  });

  it("sorts an unordered input before projecting", () => {
    const shuffled = [linear[2], linear[0], linear[3], linear[1]].filter(
      (entry): entry is Observation => entry !== undefined,
    );

    expect(project("naive", shuffled, 1).points[0]?.value).toBe(16);
  });

  it("pins the resolved parameters onto every result", () => {
    const result = project("moving_average", linear, 1, { windowSize: 99 });

    expect(result.parameters.windowSize).toBe(4);
    expect(result.parameters.alpha).toBe(DEFAULT_ALPHA);
  });

  it("carries the method through unchanged", () => {
    for (const method of FORECAST_METHODS) {
      expect(project(method, linear, 1).method).toBe(method);
    }
  });

  it("produces the requested number of points for every method", () => {
    for (const method of FORECAST_METHODS) {
      expect(project(method, seasonal, 4, {}, 4).points).toHaveLength(4);
    }
  });
});

describe("project — naive", () => {
  it("repeats the last observed value flat", () => {
    const result = project("naive", linear, 3);

    expect(result.points.map((point) => point.value)).toEqual([16, 16, 16]);
  });

  it("fits every period but the first, from its predecessor", () => {
    const result = project("naive", linear, 1);

    expect(result.fitted.map((point) => point.period)).toEqual([1, 2, 3]);
    expect(result.fitted.map((point) => point.fitted)).toEqual([10, 12, 14]);
    expect(result.fitted.map((point) => point.residual)).toEqual([2, 2, 2]);
  });

  it("is what projectBaseline computes", () => {
    expect(projectBaseline(linear, 2).points).toEqual(project("naive", linear, 2).points);
  });
});

describe("project — drift", () => {
  it("continues the movement between the first and last observations", () => {
    const result = project("drift", linear, 3);

    expect(result.points.map((point) => point.value)).toEqual([18, 20, 22]);
  });

  it("reads only the endpoints, so an excursion in the middle does not bend it", () => {
    const excursion = [
      observation(0, 10),
      observation(1, 90),
      observation(2, 14),
      observation(3, 16),
    ];

    expect(project("drift", excursion, 1).points[0]?.value).toBe(18);
  });

  it("is flat when the first and last observations agree", () => {
    const flat = [observation(0, 10), observation(1, 25), observation(2, 5), observation(3, 10)];

    expect(project("drift", flat, 2).points.map((point) => point.value)).toEqual([10, 10]);
  });

  it("scales the drift across a gap when fitting in-sample", () => {
    const gappy = [observation(0, 10), observation(2, 14), observation(4, 18)];
    const result = project("drift", gappy, 1);

    expect(result.fitted.map((point) => point.fitted)).toEqual([14, 18]);
  });
});

describe("project — moving average", () => {
  it("projects the mean of the trailing window, flat", () => {
    const result = project("moving_average", linear, 2, { windowSize: 3 });

    expect(result.points.map((point) => point.value)).toEqual([14, 14]);
  });

  it("fits only the periods with a full window behind them", () => {
    const result = project("moving_average", linear, 1, { windowSize: 3 });

    expect(result.fitted.map((point) => point.period)).toEqual([3]);
    expect(result.fitted[0]?.fitted).toBe(12);
  });

  it("collapses to the naive value at a window of one", () => {
    expect(project("moving_average", linear, 1, { windowSize: 1 }).points[0]?.value).toBe(16);
  });

  it("averages the whole series when the window spans it", () => {
    expect(project("moving_average", linear, 1, { windowSize: 4 }).points[0]?.value).toBe(13);
  });
});

describe("project — linear trend", () => {
  it("extends the regression line", () => {
    const result = project("linear_trend", linear, 3);

    expect(result.points.map((point) => point.value)).toEqual([18, 20, 22]);
  });

  it("fits every period, exactly, on a perfectly linear series", () => {
    const result = project("linear_trend", linear, 1);

    expect(result.fitted).toHaveLength(4);
    expect(result.fitted.every((point) => point.residual === 0)).toBe(true);
  });

  it("weighs the middle of the series, unlike drift", () => {
    const excursion = [
      observation(0, 10),
      observation(1, 90),
      observation(2, 14),
      observation(3, 20),
    ];

    expect(project("linear_trend", excursion, 1).points[0]?.value).toBe(22);
    expect(project("drift", excursion, 1).points[0]?.value).toBe(23.333333);
  });

  it("projects across a gap on the true period, not the next index", () => {
    const gappy = [observation(0, 0), observation(1, 10), observation(4, 40)];
    const result = project("linear_trend", gappy, 1);

    expect(result.points[0]?.period).toBe(5);
    expect(result.points[0]?.value).toBe(50);
  });
});

describe("project — seasonal naive", () => {
  it("reads the same seasonal position one cycle back", () => {
    const result = project("seasonal_naive", seasonal, 4, {}, 4);

    expect(result.points.map((point) => point.value)).toEqual([11, 21, 31, 41]);
    expect(result.fallbackPeriods).toEqual([]);
  });

  it("walks back a further whole cycle when the nearest one is unobserved", () => {
    const missing = seasonal.filter((entry) => entry.period !== 4);
    const result = project("seasonal_naive", missing, 1, {}, 4);

    expect(result.points[0]?.value).toBe(10);
    expect(result.fallbackPeriods).toEqual([]);
  });

  it("repeats the observed season indefinitely once every position has been seen", () => {
    const short = [observation(0, 10), observation(1, 20), observation(2, 30), observation(3, 40)];
    const result = project("seasonal_naive", short, 6, {}, 4);

    expect(result.points.map((point) => point.value)).toEqual([10, 20, 30, 40, 10, 20]);
    expect(result.fallbackPeriods).toEqual([]);
  });

  it("falls back to the last value and says so when a position was never observed at all", () => {
    // Position 2 of the cycle is missing from every cycle, so period 10 has no season to read.
    const holed = [
      observation(0, 10),
      observation(1, 20),
      observation(3, 40),
      observation(4, 11),
      observation(5, 21),
      observation(7, 41),
    ];
    const result = project("seasonal_naive", holed, 3, {}, 4);

    expect(result.points.map((point) => point.value)).toEqual([11, 21, 41]);
    expect(result.fallbackPeriods).toEqual([10]);
  });

  it("degrades to the naive projection when no cycle is declared", () => {
    const result = project("seasonal_naive", seasonal, 2, {}, null);

    expect(result.points.map((point) => point.value)).toEqual([41, 41]);
  });

  it("treats a nonsensical cycle length as no cycle at all", () => {
    expect(project("seasonal_naive", seasonal, 1, {}, 1).points[0]?.value).toBe(41);
    expect(project("seasonal_naive", seasonal, 1, {}, 2.5).points[0]?.value).toBe(41);
  });

  it("fits only the periods with a whole cycle behind them", () => {
    const result = project("seasonal_naive", seasonal, 1, {}, 4);

    expect(result.fitted.map((point) => point.period)).toEqual([4, 5, 6, 7]);
    expect(result.fitted.map((point) => point.residual)).toEqual([1, 1, 1, 1]);
  });

  it("reports fallback periods in ascending order", () => {
    const holed = [observation(0, 10), observation(1, 20), observation(4, 11), observation(5, 21)];
    const result = project("seasonal_naive", holed, 4, {}, 4);

    expect(result.fallbackPeriods).toEqual([6, 7]);
    expect([...result.fallbackPeriods]).toEqual([...result.fallbackPeriods].sort((a, b) => a - b));
  });
});

describe("project — exponential smoothing", () => {
  it("projects the final smoothed level, flat", () => {
    const result = project("exponential_smoothing", linear, 2, { alpha: 0.5 });

    expect(result.points.map((point) => point.value)).toEqual([14.25, 14.25]);
  });

  it("fits each period from the level standing before it", () => {
    const result = project("exponential_smoothing", linear, 1, { alpha: 0.5 });

    expect(result.fitted.map((point) => point.fitted)).toEqual([10, 11, 12.5]);
  });

  it("collapses to the naive value at an alpha of one", () => {
    expect(project("exponential_smoothing", linear, 1, { alpha: 1 }).points[0]?.value).toBe(16);
  });

  it("stays near the first observation at a very small alpha", () => {
    const value =
      project("exponential_smoothing", linear, 1, { alpha: 0.01 }).points[0]?.value ?? 0;

    expect(value).toBeGreaterThan(10);
    expect(value).toBeLessThan(10.5);
  });
});

describe("project — determinism and rounding", () => {
  it("gives byte-identical results across repeated runs for every method", () => {
    for (const method of FORECAST_METHODS) {
      const first = project(method, seasonal, 4, { windowSize: 3, alpha: 0.4 }, 4);
      const second = project(method, seasonal, 4, { windowSize: 3, alpha: 0.4 }, 4);

      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    }
  });

  it("rounds every projected value to the package precision", () => {
    const awkward = [
      observation(0, 1 / 3),
      observation(1, 2 / 3),
      observation(2, 1),
      observation(3, 4 / 3),
    ];

    for (const method of FORECAST_METHODS) {
      for (const point of project(method, awkward, 2, {}, 2).points) {
        expect(point.value).toBe(Number(point.value.toFixed(6)));
      }
    }
  });

  it("never mutates the observations it was given", () => {
    const given = [...linear];
    project("linear_trend", given, 3);

    expect(given).toEqual(linear);
  });
});

describe("requiredCycleFor", () => {
  it("reports the cycle only for the seasonal method", () => {
    expect(requiredCycleFor("seasonal_naive", 12)).toBe(12);
    expect(requiredCycleFor("linear_trend", 12)).toBeNull();
    expect(requiredCycleFor("seasonal_naive", null)).toBeNull();
  });
});
