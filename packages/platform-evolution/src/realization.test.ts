import { describe, expect, it } from "vitest";
import {
  BENEFIT_DIRECTIONS,
  REALIZATION_VERDICTS,
  VARIANCE_BANDS,
  VARIANCE_FLOORS,
  isRealizationVerdict,
  isVarianceBand,
} from "./evolution-value";
import type { BenefitClaim, BenefitOutcome } from "./evolution-view";
import * as realization from "./realization";
import { measureBenefit, recommendVerdict, varianceBandRank } from "./realization";

const claim = (overrides: Partial<BenefitClaim> = {}): BenefitClaim => ({
  direction: "increase",
  baseline: 60,
  target: 80,
  observed: 80,
  ...overrides,
});

/** Realize exactly this fraction of a promise, through the engine rather than by hand-building an outcome. */
const realizing = (ratio: number): BenefitOutcome =>
  measureBenefit({ direction: "increase", baseline: 0, target: 100, observed: 100 * ratio });

describe("varianceBandRank", () => {
  it("puts the best outcome at the bottom", () => {
    expect(varianceBandRank("exceeded")).toBe(0);
  });

  it("ranks the bands strictly ascending in declared severity order", () => {
    for (let i = 1; i < VARIANCE_BANDS.length; i += 1) {
      const previous = VARIANCE_BANDS[i - 1]!;
      const current = VARIANCE_BANDS[i]!;
      expect(varianceBandRank(current)).toBeGreaterThan(varianceBandRank(previous));
    }
  });

  it("puts a missed benefit above everything else", () => {
    for (const band of VARIANCE_BANDS) {
      if (band !== "missed") {
        expect(varianceBandRank("missed")).toBeGreaterThan(varianceBandRank(band));
      }
    }
  });
});

describe("measureBenefit", () => {
  it("reads a benefit that landed exactly on its target as met", () => {
    const outcome = measureBenefit(claim());
    expect(outcome.measurable).toBe(true);
    expect(outcome.promised).toBe(20);
    expect(outcome.achieved).toBe(20);
    expect(outcome.ratio).toBe(1);
    expect(outcome.band).toBe("met");
    expect(outcome.issues).toEqual([]);
  });

  it("reads a benefit that overshot as exceeded", () => {
    const outcome = measureBenefit(claim({ observed: 85 }));
    expect(outcome.ratio).toBe(1.25);
    expect(outcome.band).toBe("exceeded");
  });

  it("measures movement rather than level, so two claims at 95% of target read differently", () => {
    const ambitious = measureBenefit(claim({ baseline: 60, target: 80, observed: 76 }));
    const timid = measureBenefit(claim({ baseline: 74, target: 80, observed: 76 }));

    expect(ambitious.ratio).toBe(0.8);
    expect(ambitious.band).toBe("shortfall");
    expect(timid.ratio).toBe(0.33);
    expect(timid.band).toBe("missed");
  });

  it("reads a benefit that was supposed to bring a number down exactly like one meant to push it up", () => {
    const falling = measureBenefit({
      direction: "decrease",
      baseline: 40,
      target: 20,
      observed: 20,
    });
    expect(falling.promised).toBe(20);
    expect(falling.achieved).toBe(20);
    expect(falling.ratio).toBe(1);
    expect(falling.band).toBe("met");
  });

  it("bands a measure that moved the wrong way as missed, at a negative ratio", () => {
    const wrongWay = measureBenefit({
      direction: "decrease",
      baseline: 40,
      target: 20,
      observed: 50,
    });
    expect(wrongWay.achieved).toBe(-10);
    expect(wrongWay.ratio).toBe(-0.5);
    expect(wrongWay.band).toBe("missed");
  });

  it("reaches each band exactly on its declared floor", () => {
    expect(realizing(VARIANCE_FLOORS.exceeded).band).toBe("exceeded");
    expect(realizing(VARIANCE_FLOORS.met).band).toBe("met");
    expect(realizing(VARIANCE_FLOORS.shortfall).band).toBe("shortfall");
  });

  it("drops to the next band down just beneath each floor", () => {
    expect(realizing(1.09).band).toBe("met");
    expect(realizing(0.89).band).toBe("shortfall");
    expect(realizing(0.49).band).toBe("missed");
  });

  it("never reports a band outside the declared four", () => {
    for (const ratio of [-2, 0, 0.25, 0.75, 1, 1.5, 40]) {
      const band = realizing(ratio).band;
      expect(band).not.toBeNull();
      expect(isVarianceBand(band ?? "")).toBe(true);
    }
  });

  it("rounds the ratio onto the same two places as a maturity index", () => {
    expect(
      measureBenefit({ direction: "increase", baseline: 0, target: 3, observed: 1 }).ratio,
    ).toBe(0.33);
  });

  it("reports every non-finite field together rather than one at a time", () => {
    const broken = measureBenefit({
      direction: "increase",
      baseline: Number.NaN,
      target: Number.POSITIVE_INFINITY,
      observed: Number.NaN,
    });
    expect(broken.issues).toEqual(["invalid_baseline", "invalid_target", "invalid_observed"]);
    expect(broken.measurable).toBe(false);
    expect(broken.band).toBeNull();
    expect(broken.promised).toBe(0);
    expect(broken.achieved).toBe(0);
    expect(broken.ratio).toBe(0);
  });

  it("refuses a target identical to its baseline rather than dividing by zero", () => {
    const nothing = measureBenefit(claim({ target: 60, observed: 70 }));
    expect(nothing.issues).toEqual(["no_promised_movement"]);
    expect(nothing.measurable).toBe(false);
    expect(nothing.promised).toBe(0);
    expect(nothing.band).toBeNull();
  });

  it("refuses a target on the wrong side of its own baseline, in either direction", () => {
    const rising = measureBenefit(claim({ target: 50, observed: 55 }));
    expect(rising.issues).toEqual(["target_contradicts_direction"]);
    expect(rising.promised).toBe(-10);

    const falling = measureBenefit({
      direction: "decrease",
      baseline: 40,
      target: 60,
      observed: 50,
    });
    expect(falling.issues).toEqual(["target_contradicts_direction"]);
    expect(falling.promised).toBe(-20);
  });

  it("never bands an unmeasurable benefit, so a data problem cannot become a finding", () => {
    const unmeasurable = [
      measureBenefit(claim({ observed: Number.NaN })),
      measureBenefit(claim({ target: 60 })),
      measureBenefit(claim({ target: 50 })),
    ];
    for (const outcome of unmeasurable) {
      expect(outcome.measurable).toBe(false);
      expect(outcome.band).toBeNull();
      expect(outcome.ratio).toBe(0);
    }
  });

  it("reads a benefit that hit its target as met whichever way the measure points", () => {
    for (const direction of BENEFIT_DIRECTIONS) {
      const outcome = measureBenefit(
        direction === "increase"
          ? { direction, baseline: 10, target: 30, observed: 30 }
          : { direction, baseline: 30, target: 10, observed: 10 },
      );
      expect(outcome.ratio).toBe(1);
      expect(outcome.band).toBe("met");
    }
  });
});

describe("recommendVerdict", () => {
  it("sustains an initiative whose benefits all landed at or above what was promised", () => {
    const recommendation = recommendVerdict([realizing(1), realizing(1.4), realizing(0.95)]);
    expect(recommendation.verdict).toBe("sustained");
    expect(recommendation.worstBand).toBe("met");
    expect(recommendation.benefitsMeasured).toBe(3);
    expect(recommendation.benefitsClaimed).toBe(3);
  });

  it("recommends adjustment on a single shortfall among stronger outcomes", () => {
    const recommendation = recommendVerdict([realizing(1.5), realizing(0.6), realizing(1.2)]);
    expect(recommendation.verdict).toBe("adjust");
    expect(recommendation.worstBand).toBe("shortfall");
  });

  it("lets the severest outcome decide rather than the average, so one miss carries four wins", () => {
    const recommendation = recommendVerdict([
      realizing(1.5),
      realizing(1.5),
      realizing(1.5),
      realizing(1.5),
      realizing(0.1),
    ]);
    expect(recommendation.verdict).toBe("revert");
    expect(recommendation.worstBand).toBe("missed");
    expect(recommendation.benefitsMeasured).toBe(5);
  });

  it("names the band that earned the verdict rather than leaving it unarguable", () => {
    expect(recommendVerdict([realizing(0.2)]).worstBand).toBe("missed");
    expect(recommendVerdict([realizing(0.6)]).worstBand).toBe("shortfall");
    expect(recommendVerdict([realizing(3)]).worstBand).toBe("exceeded");
  });

  it("returns inconclusive when nothing was claimed at all", () => {
    const recommendation = recommendVerdict([]);
    expect(recommendation.verdict).toBe("inconclusive");
    expect(recommendation.worstBand).toBeNull();
    expect(recommendation.benefitsMeasured).toBe(0);
    expect(recommendation.benefitsClaimed).toBe(0);
  });

  it("returns inconclusive when everything claimed proved unmeasurable", () => {
    const recommendation = recommendVerdict([
      measureBenefit(claim({ observed: Number.NaN })),
      measureBenefit(claim({ target: 60 })),
    ]);
    expect(recommendation.verdict).toBe("inconclusive");
    expect(recommendation.worstBand).toBeNull();
    expect(recommendation.benefitsMeasured).toBe(0);
    expect(recommendation.benefitsClaimed).toBe(2);
  });

  it("keeps unmeasurable benefits out of the severity comparison but inside the counts", () => {
    const recommendation = recommendVerdict([
      realizing(1.2),
      measureBenefit(claim({ observed: Number.NaN })),
      measureBenefit(claim({ target: 60 })),
      measureBenefit(claim({ target: 50 })),
      measureBenefit(claim({ baseline: Number.NaN })),
      measureBenefit(claim({ target: Number.NaN })),
    ]);
    expect(recommendation.verdict).toBe("sustained");
    expect(recommendation.worstBand).toBe("exceeded");
    expect(recommendation.benefitsMeasured).toBe(1);
    expect(recommendation.benefitsClaimed).toBe(6);
  });

  it("never reports a verdict outside the declared four", () => {
    const cases = [[], [realizing(2)], [realizing(0.95)], [realizing(0.7)], [realizing(0)]];
    for (const outcomes of cases) {
      const { verdict } = recommendVerdict(outcomes);
      expect(isRealizationVerdict(verdict)).toBe(true);
      expect(REALIZATION_VERDICTS).toContain(verdict);
    }
  });
});

describe("deliberate absences", () => {
  it("publishes nothing else: the module exposes three functions and no more", () => {
    expect(Object.keys(realization).sort()).toEqual([
      "measureBenefit",
      "recommendVerdict",
      "varianceBandRank",
    ]);
  });

  it("bands no ratio it did not compute, keeping the banding function unreachable", () => {
    expect(Object.keys(realization)).not.toContain("bandForRatio");
  });

  it("holds no clock: the same claim always reads the same way", () => {
    const measured = claim({ observed: 74 });
    expect(measureBenefit(measured)).toEqual(measureBenefit(measured));
    expect(recommendVerdict([realizing(0.7)])).toEqual(recommendVerdict([realizing(0.7)]));
  });

  it("mutates nothing it was given", () => {
    const measured = claim({ observed: 74 });
    const outcomes = [realizing(1.2), realizing(0.4)];
    const before = JSON.stringify({ measured, outcomes });
    measureBenefit(measured);
    recommendVerdict(outcomes);
    expect(JSON.stringify({ measured, outcomes })).toBe(before);
  });

  it("recommends and nothing more: no action, effect or enactment field anywhere", () => {
    expect(Object.keys(recommendVerdict([realizing(0.1)])).sort()).toEqual([
      "benefitsClaimed",
      "benefitsMeasured",
      "verdict",
      "worstBand",
    ]);
    expect(Object.keys(realizing(0.1)).sort()).toEqual([
      "achieved",
      "band",
      "issues",
      "measurable",
      "promised",
      "ratio",
    ]);
  });
});
