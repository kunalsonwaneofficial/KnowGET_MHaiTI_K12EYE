import { describe, expect, it } from "vitest";
import {
  MIN_PERIODS_FOR_TREND,
  bandFor,
  bandMovement,
  bestBand,
  isBandFall,
  summarizeTrend,
  worstBand,
} from "./banding";
import {
  BAND_FLOORS,
  PERFORMANCE_BANDS,
  SUSTAINED_DECLINE_PERIODS,
  type PerformanceBand,
} from "./command-value";

describe("bandFor", () => {
  it("places a score in the band whose floor it reaches", () => {
    expect(bandFor(0)).toBe("failing");
    expect(bandFor(30)).toBe("at_risk");
    expect(bandFor(55)).toBe("watch");
    expect(bandFor(80)).toBe("healthy");
    expect(bandFor(95)).toBe("exemplary");
  });

  it("treats a floor as inclusive, so a round threshold takes the better band", () => {
    for (const band of PERFORMANCE_BANDS) {
      expect(bandFor(BAND_FLOORS[band])).toBe(band);
    }
  });

  it("places a score one below a floor in the band beneath it", () => {
    expect(bandFor(BAND_FLOORS.healthy - 0.001)).toBe("watch");
    expect(bandFor(BAND_FLOORS.exemplary - 0.001)).toBe("healthy");
    expect(bandFor(BAND_FLOORS.at_risk - 0.001)).toBe("failing");
  });

  it("bands the ends of the scale", () => {
    expect(bandFor(0)).toBe("failing");
    expect(bandFor(100)).toBe("exemplary");
  });

  it("clamps a score off the scale rather than refusing it", () => {
    expect(bandFor(-40)).toBe("failing");
    expect(bandFor(140)).toBe("exemplary");
  });

  it("floors every non-finite score, so a corrupt reading never presents as excellent", () => {
    expect(bandFor(Number.NaN)).toBe("failing");
    expect(bandFor(Number.POSITIVE_INFINITY)).toBe("failing");
    expect(bandFor(Number.NEGATIVE_INFINITY)).toBe("failing");
  });
});

describe("worstBand and bestBand", () => {
  const bands: readonly PerformanceBand[] = ["exemplary", "at_risk", "healthy", "watch"];

  it("finds the worst and the best across a set", () => {
    expect(worstBand(bands)).toBe("at_risk");
    expect(bestBand(bands)).toBe("exemplary");
  });

  it("returns null for an empty set rather than a default band", () => {
    expect(worstBand([])).toBeNull();
    expect(bestBand([])).toBeNull();
  });

  it("returns the only member of a singleton", () => {
    expect(worstBand(["watch"])).toBe("watch");
    expect(bestBand(["watch"])).toBe("watch");
  });

  it("does not let nine exemplary pillars hide one failing pillar", () => {
    const nineGood: PerformanceBand[] = Array.from({ length: 9 }, () => "exemplary");
    expect(worstBand([...nineGood, "failing"])).toBe("failing");
  });

  it("is order-independent", () => {
    expect(worstBand([...bands].reverse())).toBe("at_risk");
    expect(bestBand([...bands].reverse())).toBe("exemplary");
  });
});

describe("bandMovement", () => {
  it("reports an improvement with positive steps", () => {
    const movement = bandMovement("watch", "healthy");
    expect(movement.direction).toBe("improved");
    expect(movement.steps).toBe(1);
  });

  it("reports a fall with negative steps", () => {
    const movement = bandMovement("exemplary", "watch");
    expect(movement.direction).toBe("declined");
    expect(movement.steps).toBe(-2);
  });

  it("reports holding with zero steps", () => {
    const movement = bandMovement("at_risk", "at_risk");
    expect(movement.direction).toBe("held");
    expect(movement.steps).toBe(0);
  });

  it("carries both ends, so a reader never has to be told separately", () => {
    const movement = bandMovement("healthy", "failing");
    expect(movement.from).toBe("healthy");
    expect(movement.to).toBe("failing");
    expect(movement.steps).toBe(-3);
  });

  it("counts positions rather than score points", () => {
    const acrossAFloor = bandMovement(bandFor(70), bandFor(68));
    expect(acrossAFloor.steps).toBe(-1);
    const insideOneBand = bandMovement(bandFor(89), bandFor(71));
    expect(insideOneBand.steps).toBe(0);
  });

  it("identifies a fall and nothing else as a fall", () => {
    expect(isBandFall(bandMovement("healthy", "watch"))).toBe(true);
    expect(isBandFall(bandMovement("watch", "healthy"))).toBe(false);
    expect(isBandFall(bandMovement("watch", "watch"))).toBe(false);
  });

  it("is antisymmetric in steps", () => {
    expect(bandMovement("failing", "exemplary").steps).toBe(
      -bandMovement("exemplary", "failing").steps,
    );
  });
});

describe("summarizeTrend", () => {
  it("needs at least two periods before direction is a question", () => {
    expect(MIN_PERIODS_FOR_TREND).toBe(2);
    expect(summarizeTrend([])).toEqual({
      periods: 0,
      decliningRun: 0,
      sustainedDecline: false,
      netChange: 0,
    });
    expect(summarizeTrend([72])).toEqual({
      periods: 1,
      decliningRun: 0,
      sustainedDecline: false,
      netChange: 0,
    });
  });

  it("reports net change from first to last", () => {
    expect(summarizeTrend([60, 70, 82]).netChange).toBe(22);
    expect(summarizeTrend([82, 70, 60]).netChange).toBe(-22);
  });

  it("rounds net change to the fixed precision", () => {
    expect(summarizeTrend([0.1, 0.3]).netChange).toBe(0.2);
  });

  it("normalizes a net change of nothing, so a flat series digests identically", () => {
    expect(Object.is(summarizeTrend([70, 70]).netChange, 0)).toBe(true);
  });

  it("counts consecutive falls ending at the most recent score", () => {
    expect(summarizeTrend([80, 78, 76]).decliningRun).toBe(2);
    expect(summarizeTrend([80, 78, 76, 74]).decliningRun).toBe(3);
  });

  it("calls a run at the threshold a sustained decline", () => {
    const scores = [90, 85, 80, 75];
    expect(summarizeTrend(scores).decliningRun).toBe(SUSTAINED_DECLINE_PERIODS);
    expect(summarizeTrend(scores).sustainedDecline).toBe(true);
  });

  it("does not call a shorter run sustained", () => {
    expect(summarizeTrend([90, 85, 80]).sustainedDecline).toBe(false);
  });

  it("ignores a decline that ended, because it is somebody's finished problem", () => {
    const recovered = summarizeTrend([90, 80, 70, 60, 95]);
    expect(recovered.decliningRun).toBe(0);
    expect(recovered.sustainedDecline).toBe(false);
  });

  it("breaks a run on a flat period rather than extending it", () => {
    expect(summarizeTrend([90, 85, 80, 80]).decliningRun).toBe(0);
    expect(summarizeTrend([90, 85, 85, 80]).decliningRun).toBe(1);
  });

  it("reports a rise as no declining run", () => {
    expect(summarizeTrend([60, 70, 80, 90]).decliningRun).toBe(0);
  });

  it("separates net improvement from a current slide", () => {
    const verdict = summarizeTrend([50, 90, 85, 80, 75]);
    expect(verdict.netChange).toBe(25);
    expect(verdict.sustainedDecline).toBe(true);
  });

  it("drops non-finite scores rather than treating them as falls", () => {
    const verdict = summarizeTrend([80, Number.NaN, 78, Number.POSITIVE_INFINITY, 76]);
    expect(verdict.periods).toBe(3);
    expect(verdict.decliningRun).toBe(2);
  });

  it("counts a whole falling series as one run", () => {
    expect(summarizeTrend([100, 90, 80, 70, 60]).decliningRun).toBe(4);
  });
});
