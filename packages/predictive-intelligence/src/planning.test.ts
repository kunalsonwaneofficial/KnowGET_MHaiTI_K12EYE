import { describe, expect, it } from "vitest";

import type { ObjectiveProgressView, ObjectiveView } from "./forecast-view";
import {
  computeObjectiveVariance,
  computePlanVariance,
  elapsedFraction,
  expectedValueAt,
  hasMetTarget,
  latestProgressAt,
  progressRatioFor,
  shortfallRatio,
  trackingStateFor,
} from "./planning";

const objective = (overrides: Partial<ObjectiveView> = {}): ObjectiveView => ({
  objectiveKey: "lift_attendance",
  metricKey: "attendance.rate",
  direction: "higher_is_better",
  baselineValue: 80,
  targetValue: 90,
  targetPeriod: 10,
  ...overrides,
});

const progress = (
  objectiveKey: string,
  period: number,
  actualValue: number,
): ObjectiveProgressView => ({ objectiveKey, period, actualValue });

describe("elapsedFraction", () => {
  it("is zero at the start and one at the target", () => {
    expect(elapsedFraction(0, 0, 10)).toBe(0);
    expect(elapsedFraction(10, 0, 10)).toBe(1);
  });

  it("is the straight-line fraction in between", () => {
    expect(elapsedFraction(5, 0, 10)).toBe(0.5);
    expect(elapsedFraction(4, 2, 10)).toBe(0.25);
  });

  it("expects nothing before the plan began", () => {
    expect(elapsedFraction(-3, 0, 10)).toBe(0);
  });

  it("does not extrapolate past the target period", () => {
    expect(elapsedFraction(40, 0, 10)).toBe(1);
  });

  it("treats a target due at or before the start as due immediately", () => {
    expect(elapsedFraction(0, 5, 5)).toBe(1);
    expect(elapsedFraction(0, 5, 2)).toBe(1);
  });
});

describe("expectedValueAt", () => {
  it("walks the straight line from baseline to target", () => {
    expect(expectedValueAt(objective(), 0, 0)).toBe(80);
    expect(expectedValueAt(objective(), 5, 0)).toBe(85);
    expect(expectedValueAt(objective(), 10, 0)).toBe(90);
  });

  it("walks it downward just as readily", () => {
    const falling = objective({ direction: "lower_is_better", baselineValue: 12, targetValue: 4 });

    expect(expectedValueAt(falling, 5, 0)).toBe(8);
  });

  it("expects the target, not more, after the target period", () => {
    expect(expectedValueAt(objective(), 25, 0)).toBe(90);
  });

  it("starts from the plan's own start period rather than zero", () => {
    expect(expectedValueAt(objective({ targetPeriod: 12 }), 6, 2)).toBe(84);
  });
});

describe("progressRatioFor", () => {
  it("reports the fraction of the journey covered", () => {
    expect(progressRatioFor(objective(), 85)).toBe(0.5);
  });

  it("reads a downward objective the same way, without being told the direction", () => {
    const falling = objective({ direction: "lower_is_better", baselineValue: 12, targetValue: 4 });

    expect(progressRatioFor(falling, 8)).toBe(0.5);
  });

  it("goes negative where the objective moved the wrong way", () => {
    expect(progressRatioFor(objective(), 78)).toBe(-0.2);
  });

  it("goes past one where the objective overshot", () => {
    expect(progressRatioFor(objective(), 95)).toBe(1.5);
  });

  it("declines to answer where the objective asked for no movement", () => {
    expect(progressRatioFor(objective({ targetValue: 80 }), 80)).toBeNull();
  });
});

describe("hasMetTarget", () => {
  it("counts an overshoot as met for a metric that wants to climb", () => {
    expect(hasMetTarget("higher_is_better", 92, 90)).toBe(true);
    expect(hasMetTarget("higher_is_better", 90, 90)).toBe(true);
    expect(hasMetTarget("higher_is_better", 89.9, 90)).toBe(false);
  });

  it("counts an undershoot as met for a metric that wants to fall", () => {
    expect(hasMetTarget("lower_is_better", 3, 4)).toBe(true);
    expect(hasMetTarget("lower_is_better", 4, 4)).toBe(true);
    expect(hasMetTarget("lower_is_better", 4.1, 4)).toBe(false);
  });

  it("asks a neutral metric to arrive, not to exceed", () => {
    expect(hasMetTarget("neutral", 90, 90)).toBe(true);
    expect(hasMetTarget("neutral", 91, 90)).toBe(false);
    expect(hasMetTarget("neutral", 89, 90)).toBe(false);
  });

  it("judges a neutral metric at the precision everything else is rounded to", () => {
    expect(hasMetTarget("neutral", 90 + 1e-12, 90)).toBe(true);
  });
});

describe("shortfallRatio", () => {
  it("is positive where a climbing metric fell behind the line", () => {
    expect(shortfallRatio("higher_is_better", 83, 85, 10)).toBe(0.2);
  });

  it("is negative where a climbing metric ran ahead of it", () => {
    expect(shortfallRatio("higher_is_better", 87, 85, 10)).toBe(-0.2);
  });

  it("reads a falling metric the other way round", () => {
    expect(shortfallRatio("lower_is_better", 9, 8, -8)).toBe(0.125);
    expect(shortfallRatio("lower_is_better", 7, 8, -8)).toBe(-0.125);
  });

  it("normalizes by the length of the journey, not by its sign", () => {
    expect(shortfallRatio("higher_is_better", 83, 85, -10)).toBe(0.2);
    expect(shortfallRatio("higher_is_better", 83, 85, 10)).toBe(0.2);
  });

  it("treats an overshoot on a neutral metric as a departure, not as progress", () => {
    expect(shortfallRatio("neutral", 87, 85, 10)).toBe(0.2);
    expect(shortfallRatio("neutral", 83, 85, 10)).toBe(0.2);
  });

  it("has nothing to measure where the objective asked for no movement", () => {
    expect(shortfallRatio("higher_is_better", 70, 80, 0)).toBe(0);
  });
});

describe("trackingStateFor", () => {
  it("calls an objective on track while it is at or near its line", () => {
    expect(trackingStateFor(objective(), 85, 85, 5)).toBe("on_track");
    expect(trackingStateFor(objective(), 87, 85, 5)).toBe("on_track");
    expect(trackingStateFor(objective(), 84.6, 85, 5)).toBe("on_track");
  });

  it("calls it at risk once it has slipped past the tolerance", () => {
    expect(trackingStateFor(objective(), 84, 85, 5)).toBe("at_risk");
    expect(trackingStateFor(objective(), 83.6, 85, 5)).toBe("at_risk");
  });

  it("calls it off track once the slip needs a decision", () => {
    expect(trackingStateFor(objective(), 83, 85, 5)).toBe("off_track");
    expect(trackingStateFor(objective(), 70, 85, 5)).toBe("off_track");
  });

  it("calls a met target achieved whatever the trajectory looked like", () => {
    expect(trackingStateFor(objective(), 91, 82, 2)).toBe("achieved");
  });

  it("calls a target delivered late delivered, not missed", () => {
    expect(trackingStateFor(objective(), 91, 90, 40)).toBe("achieved");
  });

  it("calls an unmet target missed once its period has passed", () => {
    expect(trackingStateFor(objective(), 89, 90, 10)).toBe("missed");
    expect(trackingStateFor(objective(), 89, 90, 11)).toBe("missed");
  });

  it("does not award partial credit for partly holding a level", () => {
    const hold = objective({ baselineValue: 80, targetValue: 80 });

    expect(trackingStateFor(hold, 80, 80, 5)).toBe("achieved");
    expect(trackingStateFor(hold, 79.99, 80, 5)).toBe("off_track");
    expect(trackingStateFor(hold, 79.99, 80, 10)).toBe("missed");
  });

  it("reads a falling objective correctly rather than inverting it", () => {
    const falling = objective({ direction: "lower_is_better", baselineValue: 12, targetValue: 4 });

    expect(trackingStateFor(falling, 7.5, 8, 5)).toBe("on_track");
    expect(trackingStateFor(falling, 9, 8, 5)).toBe("at_risk");
    expect(trackingStateFor(falling, 11, 8, 5)).toBe("off_track");
  });

  it("reads a target below the baseline as a floor, already met on the way down", () => {
    // A `higher_is_better` metric aiming downward is a plan that permits a decline to a floor, and anything
    // above that floor satisfies it. The straight line is never consulted, because there is nothing left to
    // reach — which is the right reading, but a surprising enough one to pin down here.
    const floor = objective({ baselineValue: 90, targetValue: 80 });

    expect(trackingStateFor(floor, 85, 85, 5)).toBe("achieved");
    expect(trackingStateFor(floor, 81, 85, 5)).toBe("achieved");
  });

  it("judges a fall through that floor against the line it should have followed", () => {
    const floor = objective({ baselineValue: 90, targetValue: 80 });

    expect(trackingStateFor(floor, 79, 85, 5)).toBe("off_track");
    expect(trackingStateFor(floor, 79, 85, 10)).toBe("missed");
  });
});

describe("latestProgressAt", () => {
  const records = [
    progress("lift_attendance", 2, 82),
    progress("lift_attendance", 5, 84),
    progress("other", 5, 999),
  ];

  it("takes the most recent reading at or before the period", () => {
    expect(latestProgressAt(records, "lift_attendance", 6)?.actualValue).toBe(84);
    expect(latestProgressAt(records, "lift_attendance", 4)?.actualValue).toBe(82);
  });

  it("carries a reading forward through periods nobody reviewed", () => {
    expect(latestProgressAt(records, "lift_attendance", 9)?.actualValue).toBe(84);
  });

  it("does not read the future", () => {
    expect(latestProgressAt(records, "lift_attendance", 1)).toBeNull();
  });

  it("does not read another objective's reading", () => {
    expect(latestProgressAt(records, "unreviewed", 9)).toBeNull();
  });

  it("matches the key however it was cased", () => {
    expect(latestProgressAt(records, "  Lift_Attendance ", 6)?.actualValue).toBe(84);
  });

  it("takes the later of two readings for the same period", () => {
    const corrected = [progress("k", 3, 10), progress("k", 3, 12)];

    expect(latestProgressAt(corrected, "k", 3)?.actualValue).toBe(12);
  });
});

describe("computeObjectiveVariance", () => {
  it("sets the reading against the line and names the gap", () => {
    const variance = computeObjectiveVariance(
      objective(),
      [progress("lift_attendance", 5, 84)],
      5,
      0,
    );

    expect(variance.expectedValue).toBe(85);
    expect(variance.actualValue).toBe(84);
    expect(variance.variance).toBe(-1);
    expect(variance.progressRatio).toBe(0.4);
    expect(variance.state).toBe("at_risk");
  });

  it("scores an objective nobody reviewed at its baseline rather than dropping it", () => {
    const variance = computeObjectiveVariance(objective(), [], 5, 0);

    expect(variance.actualValue).toBe(80);
    expect(variance.progressRatio).toBe(0);
    expect(variance.state).toBe("off_track");
  });

  it("normalizes the objective key it reports", () => {
    expect(
      computeObjectiveVariance(objective({ objectiveKey: " Lift_Attendance " }), [], 1, 0)
        .objectiveKey,
    ).toBe("lift_attendance");
  });

  it("records the period it was asked about", () => {
    expect(computeObjectiveVariance(objective(), [], 7, 0).period).toBe(7);
  });

  it("declines a progress ratio for an objective that asked for no movement", () => {
    const hold = objective({ targetValue: 80 });

    expect(computeObjectiveVariance(hold, [], 5, 0).progressRatio).toBeNull();
  });
});

describe("computePlanVariance", () => {
  const objectives = [
    objective({ objectiveKey: "attendance" }),
    objective({ objectiveKey: "collection", metricKey: "fees.collection_rate" }),
  ];

  it("reports every objective, sorted by key", () => {
    const plan = computePlanVariance("growth_plan", objectives, [], 5, 0);

    expect(plan.objectives.map((each) => each.objectiveKey)).toEqual(["attendance", "collection"]);
  });

  it("counts the objectives in each state", () => {
    const plan = computePlanVariance(
      "p",
      objectives,
      [progress("attendance", 5, 85), progress("collection", 5, 91)],
      5,
      0,
    );

    expect(plan.onTrackCount).toBe(1);
    expect(plan.achievedCount).toBe(1);
    expect(plan.atRiskCount).toBe(0);
    expect(plan.offTrackCount).toBe(0);
    expect(plan.missedCount).toBe(0);
  });

  it("takes the worst objective's state, not the average of them", () => {
    const nineGoodOneBad = [
      ...Array.from({ length: 9 }, (_unused, index) =>
        objective({ objectiveKey: `good_${index}` }),
      ),
      objective({ objectiveKey: "bad" }),
    ];
    const readings = [
      ...Array.from({ length: 9 }, (_unused, index) => progress(`good_${index}`, 5, 85)),
      progress("bad", 5, 70),
    ];
    const plan = computePlanVariance("p", nineGoodOneBad, readings, 5, 0);

    expect(plan.onTrackCount).toBe(9);
    expect(plan.offTrackCount).toBe(1);
    expect(plan.state).toBe("off_track");
  });

  it("says a plan is achieved when every one of its objectives is", () => {
    const plan = computePlanVariance(
      "p",
      objectives,
      [progress("attendance", 5, 95), progress("collection", 5, 95)],
      5,
      0,
    );

    expect(plan.achievedCount).toBe(2);
    expect(plan.state).toBe("achieved");
  });

  it("does not let one achieved objective flatter a plan that is on track", () => {
    const plan = computePlanVariance(
      "p",
      objectives,
      [progress("attendance", 5, 95), progress("collection", 5, 85)],
      5,
      0,
    );

    expect(plan.state).toBe("on_track");
  });

  it("reports a plan with nothing in it as on track rather than achieved", () => {
    const plan = computePlanVariance("p", [], [], 5, 0);

    expect(plan.objectives).toEqual([]);
    expect(plan.state).toBe("on_track");
  });

  it("counts an unreviewed objective against the plan", () => {
    const plan = computePlanVariance("p", objectives, [progress("attendance", 5, 85)], 5, 0);

    expect(plan.onTrackCount).toBe(1);
    expect(plan.offTrackCount).toBe(1);
    expect(plan.state).toBe("off_track");
  });

  it("normalizes the plan key and records the period", () => {
    const plan = computePlanVariance("  Growth_Plan ", objectives, [], 7, 0);

    expect(plan.planKey).toBe("growth_plan");
    expect(plan.period).toBe(7);
  });

  it("gives the same answer whatever order the objectives and readings arrive in", () => {
    const readings = [progress("collection", 5, 91), progress("attendance", 5, 84)];
    const forward = computePlanVariance("p", objectives, readings, 5, 0);
    const backward = computePlanVariance(
      "p",
      [...objectives].reverse(),
      [...readings].reverse(),
      5,
      0,
    );

    expect(forward).toEqual(backward);
  });

  it("turns to missed once the target period has passed with targets unmet", () => {
    const plan = computePlanVariance(
      "p",
      objectives,
      [progress("attendance", 10, 89), progress("collection", 10, 95)],
      10,
      0,
    );

    expect(plan.missedCount).toBe(1);
    expect(plan.achievedCount).toBe(1);
    expect(plan.state).toBe("missed");
  });
});
