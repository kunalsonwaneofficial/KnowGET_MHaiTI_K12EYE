import { describe, expect, it } from "vitest";

import type { ForecastPoint, LeverView } from "./forecast-view";
import { REQUIRED_CONFIDENCE_LEVEL } from "./forecast-value";
import {
  applyLever,
  isLeverAdmissible,
  leverAssumptionPairs,
  orderLevers,
  simulate,
} from "./simulation";

const point = (horizon: number, value: number): ForecastPoint => ({
  period: 11 + horizon,
  horizon,
  label: `P${11 + horizon}`,
  value,
  intervals: [{ level: REQUIRED_CONFIDENCE_LEVEL, lower: value - 5, upper: value + 5 }],
  intervalWidth: 10,
});

const lever = (overrides: Partial<LeverView> = {}): LeverView => ({
  leverKey: "fee_rise",
  kind: "multiplicative",
  magnitude: 1.1,
  fromHorizon: 1,
  assumptionKey: null,
  ...overrides,
});

const baseline = [point(1, 100), point(2, 100), point(3, 100)];

describe("isLeverAdmissible", () => {
  it("accepts a proportional lever inside the band", () => {
    expect(isLeverAdmissible(lever({ kind: "multiplicative", magnitude: 1.1 }))).toBe(true);
    expect(isLeverAdmissible(lever({ kind: "growth_rate", magnitude: 1.04 }))).toBe(true);
  });

  it("refuses a proportional lever that has become the answer", () => {
    expect(isLeverAdmissible(lever({ kind: "multiplicative", magnitude: 11 }))).toBe(false);
    expect(isLeverAdmissible(lever({ kind: "growth_rate", magnitude: 0 }))).toBe(false);
    expect(isLeverAdmissible(lever({ kind: "multiplicative", magnitude: -1 }))).toBe(false);
  });

  it("puts no ceiling on a flat movement or an assumed figure", () => {
    expect(isLeverAdmissible(lever({ kind: "additive", magnitude: 1_000_000 }))).toBe(true);
    expect(isLeverAdmissible(lever({ kind: "additive", magnitude: -500 }))).toBe(true);
    expect(isLeverAdmissible(lever({ kind: "override", magnitude: 0 }))).toBe(true);
  });

  it("refuses a magnitude that is not a number at all", () => {
    expect(isLeverAdmissible(lever({ kind: "additive", magnitude: Number.NaN }))).toBe(false);
    expect(
      isLeverAdmissible(lever({ kind: "additive", magnitude: Number.POSITIVE_INFINITY })),
    ).toBe(false);
  });

  it("refuses a lever that starts before the projection does", () => {
    expect(isLeverAdmissible(lever({ fromHorizon: 0 }))).toBe(false);
    expect(isLeverAdmissible(lever({ fromHorizon: -2 }))).toBe(false);
    expect(isLeverAdmissible(lever({ fromHorizon: 1.5 }))).toBe(false);
  });
});

describe("orderLevers", () => {
  it("puts the assumed figure first and the flat movement last", () => {
    const ordered = orderLevers([
      lever({ leverKey: "a", kind: "additive", magnitude: 5 }),
      lever({ leverKey: "m", kind: "multiplicative" }),
      lever({ leverKey: "o", kind: "override", magnitude: 50 }),
      lever({ leverKey: "g", kind: "growth_rate", magnitude: 1.04 }),
    ]);

    expect(ordered.map((each) => each.kind)).toEqual([
      "override",
      "growth_rate",
      "multiplicative",
      "additive",
    ]);
  });

  it("breaks a tie on key, so a repository's ordering cannot change the answer", () => {
    const forward = orderLevers([lever({ leverKey: "zeta" }), lever({ leverKey: "alpha" })]);
    const backward = orderLevers([lever({ leverKey: "alpha" }), lever({ leverKey: "zeta" })]);

    expect(forward.map((each) => each.leverKey)).toEqual(["alpha", "zeta"]);
    expect(forward).toEqual(backward);
  });

  it("does not mutate what it was given", () => {
    const levers = [lever({ leverKey: "z", kind: "additive" }), lever({ leverKey: "a" })];
    orderLevers(levers);

    expect(levers.map((each) => each.leverKey)).toEqual(["z", "a"]);
  });
});

describe("applyLever", () => {
  it("adds a flat movement", () => {
    expect(applyLever(100, lever({ kind: "additive", magnitude: 12 }), 1)).toBe(112);
  });

  it("scales a proportional movement", () => {
    expect(applyLever(100, lever({ kind: "multiplicative", magnitude: 1.1 }), 1)).toBe(100 * 1.1);
  });

  it("discards the projection for an assumed figure", () => {
    expect(applyLever(100, lever({ kind: "override", magnitude: 42 }), 5)).toBe(42);
  });

  it("compounds growth from the horizon the lever starts at, inclusive", () => {
    const growth = lever({ kind: "growth_rate", magnitude: 1.1, fromHorizon: 2 });

    expect(applyLever(100, growth, 2)).toBeCloseTo(110, 9);
    expect(applyLever(100, growth, 3)).toBeCloseTo(121, 9);
    expect(applyLever(100, growth, 4)).toBeCloseTo(133.1, 9);
  });

  it("does not scale a flat movement by how far into the projection it is", () => {
    const flat = lever({ kind: "additive", magnitude: 10, fromHorizon: 1 });

    expect(applyLever(100, flat, 1)).toBe(110);
    expect(applyLever(100, flat, 6)).toBe(110);
  });
});

describe("simulate", () => {
  it("carries the baseline on every point, including the ones no lever touched", () => {
    const outcome = simulate(
      "fee_uplift",
      baseline,
      [lever({ kind: "additive", magnitude: 10, fromHorizon: 3 })],
      "moderate",
    );

    expect(outcome.points.map((each) => each.baselineValue)).toEqual([100, 100, 100]);
    expect(outcome.points.map((each) => each.scenarioValue)).toEqual([100, 100, 110]);
    expect(outcome.points.map((each) => each.appliedLeverKeys)).toEqual([[], [], ["fee_rise"]]);
  });

  it("applies a lever only from the horizon it declared", () => {
    const outcome = simulate(
      "s",
      baseline,
      [lever({ kind: "multiplicative", magnitude: 1.5, fromHorizon: 2 })],
      "tight",
    );

    expect(outcome.points.map((each) => each.scenarioValue)).toEqual([100, 150, 150]);
  });

  it("reports the movement in absolute and relative terms", () => {
    const outcome = simulate("s", [point(1, 200)], [lever({ magnitude: 1.1 })], "tight");

    expect(outcome.points[0]?.delta).toBe(20);
    expect(outcome.points[0]?.relativeDelta).toBeCloseTo(0.1, 9);
  });

  it("declines a relative movement against a baseline of zero", () => {
    const outcome = simulate(
      "s",
      [point(1, 0)],
      [lever({ kind: "additive", magnitude: 10 })],
      "tight",
    );

    expect(outcome.points[0]?.delta).toBe(10);
    expect(outcome.points[0]?.relativeDelta).toBeNull();
  });

  it("totals the baseline and the scenario side by side", () => {
    const outcome = simulate(
      "s",
      baseline,
      [lever({ kind: "additive", magnitude: 10, fromHorizon: 2 })],
      "moderate",
    );

    expect(outcome.totalBaseline).toBe(300);
    expect(outcome.totalScenario).toBe(320);
    expect(outcome.totalDelta).toBe(20);
  });

  it("reports the largest single movement with its sign, not the last one", () => {
    const outcome = simulate(
      "s",
      baseline,
      [
        lever({ leverKey: "cut", kind: "additive", magnitude: -40, fromHorizon: 1 }),
        lever({ leverKey: "back", kind: "additive", magnitude: 35, fromHorizon: 2 }),
      ],
      "moderate",
    );

    expect(outcome.points.map((each) => each.delta)).toEqual([-40, -5, -5]);
    expect(outcome.peakDelta).toBe(-40);
  });

  it("applies levers in a fixed order rather than the order they arrived in", () => {
    const levers = [
      lever({ leverKey: "flat", kind: "additive", magnitude: 10 }),
      lever({ leverKey: "scale", kind: "multiplicative", magnitude: 2 }),
    ];
    const forward = simulate("s", [point(1, 100)], levers, "tight");
    const backward = simulate("s", [point(1, 100)], [...levers].reverse(), "tight");

    // Scale then add: 100 * 2 + 10. The other order would give 220.
    expect(forward.points[0]?.scenarioValue).toBe(210);
    expect(backward.points[0]?.scenarioValue).toBe(210);
  });

  it("lets a later lever move an assumed figure rather than being voided by it", () => {
    const outcome = simulate(
      "s",
      [point(1, 100)],
      [
        lever({ leverKey: "assume", kind: "override", magnitude: 500 }),
        lever({ leverKey: "inflate", kind: "multiplicative", magnitude: 1.1 }),
      ],
      "moderate",
    );

    expect(outcome.points[0]?.scenarioValue).toBe(550);
    expect(outcome.points[0]?.appliedLeverKeys).toEqual(["assume", "inflate"]);
  });

  it("says plainly when the projection was discarded for at least one period", () => {
    const withOverride = simulate(
      "s",
      baseline,
      [lever({ kind: "override", magnitude: 500, fromHorizon: 3 })],
      "wide",
    );
    const without = simulate("s", baseline, [lever({ magnitude: 1.1 })], "wide");

    expect(withOverride.overridden).toBe(true);
    expect(without.overridden).toBe(false);
  });

  it("names a lever whose magnitude could not be applied instead of throwing", () => {
    const outcome = simulate(
      "s",
      baseline,
      [
        lever({ leverKey: "wild", kind: "multiplicative", magnitude: 50 }),
        lever({ leverKey: "sane", kind: "additive", magnitude: 5 }),
      ],
      "moderate",
    );

    expect(outcome.unappliedLeverKeys).toEqual(["wild"]);
    expect(outcome.points.map((each) => each.scenarioValue)).toEqual([105, 105, 105]);
  });

  it("names a lever that starts past the end of the projection", () => {
    const outcome = simulate("s", baseline, [lever({ fromHorizon: 9 })], "moderate");

    expect(outcome.unappliedLeverKeys).toEqual(["fee_rise"]);
    expect(outcome.totalDelta).toBe(0);
  });

  it("names every lever when there is no projection to move", () => {
    const outcome = simulate("s", [], [lever({ leverKey: "a" }), lever({ leverKey: "b" })], "wide");

    expect(outcome.points).toEqual([]);
    expect(outcome.unappliedLeverKeys).toEqual(["a", "b"]);
    expect(outcome.totalBaseline).toBe(0);
    expect(outcome.totalScenario).toBe(0);
    expect(outcome.peakDelta).toBe(0);
  });

  it("does not name a lever twice when it is both inadmissible and out of range", () => {
    const outcome = simulate(
      "s",
      baseline,
      [lever({ leverKey: "bad", kind: "multiplicative", magnitude: 99, fromHorizon: 9 })],
      "moderate",
    );

    expect(outcome.unappliedLeverKeys).toEqual(["bad"]);
  });

  it("inherits the baseline's uncertainty unchanged", () => {
    for (const grade of ["tight", "moderate", "wide", "unusable"] as const) {
      expect(simulate("s", baseline, [lever()], grade).inheritedUncertainty).toBe(grade);
    }
  });

  it("cannot make an unusable forecast look settled by choosing good levers", () => {
    const outcome = simulate(
      "s",
      baseline,
      [lever({ kind: "additive", magnitude: 0 })],
      "unusable",
    );

    expect(outcome.inheritedUncertainty).toBe("unusable");
  });

  it("normalizes the scenario key it reports", () => {
    expect(simulate("  Fee_Uplift  ", baseline, [], "tight").scenarioKey).toBe("fee_uplift");
  });

  it("gives the same answer for the same scenario, every time", () => {
    const levers = [
      lever({ leverKey: "g", kind: "growth_rate", magnitude: 1.04, fromHorizon: 2 }),
      lever({ leverKey: "a", kind: "additive", magnitude: 7 }),
    ];

    expect(simulate("s", baseline, levers, "moderate")).toEqual(
      simulate("s", baseline, levers, "moderate"),
    );
  });
});

describe("leverAssumptionPairs", () => {
  it("pairs each lever with the belief it is testing", () => {
    const pairs = leverAssumptionPairs([
      lever({ leverKey: "fee_rise", assumptionKey: "Fees_Hold" }),
      lever({ leverKey: "intake", kind: "additive", magnitude: 5, assumptionKey: "intake_flat" }),
    ]);

    expect(pairs).toEqual([
      { leverKey: "fee_rise", assumptionKey: "fees_hold" },
      { leverKey: "intake", assumptionKey: "intake_flat" },
    ]);
  });

  it("leaves out a lever exploring something nobody assumed", () => {
    expect(leverAssumptionPairs([lever({ assumptionKey: null })])).toEqual([]);
    expect(leverAssumptionPairs([lever({ assumptionKey: "   " })])).toEqual([]);
  });

  it("reports pairs in application order rather than arrival order", () => {
    const pairs = leverAssumptionPairs([
      lever({ leverKey: "z", kind: "additive", magnitude: 1, assumptionKey: "a" }),
      lever({ leverKey: "y", kind: "override", magnitude: 1, assumptionKey: "b" }),
    ]);

    expect(pairs.map((pair) => pair.leverKey)).toEqual(["y", "z"]);
  });
});
