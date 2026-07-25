import { describe, expect, it } from "vitest";
import { computeDepreciation } from "./depreciation";
import { InvalidDepreciationError } from "./errors";
import type { AssetDepreciationView } from "./resource-view";

const laptop: AssetDepreciationView = {
  acquisitionCostMinor: 6000000, // 60,000.00
  salvageValueMinor: 600000, // 6,000.00
  usefulLifeMonths: 36,
  currency: "INR",
};

describe("computeDepreciation (straight-line)", () => {
  it("is zero at acquisition and lands exactly on salvage at end of life", () => {
    const atStart = computeDepreciation(laptop, 0);
    expect(atStart.accumulatedDepreciationMinor).toBe(0);
    expect(atStart.netBookValueMinor).toBe(6000000);
    expect(atStart.fullyDepreciated).toBe(false);

    const atEnd = computeDepreciation(laptop, 36);
    expect(atEnd.accumulatedDepreciationMinor).toBe(5400000); // the depreciable base
    expect(atEnd.netBookValueMinor).toBe(600000); // exactly the salvage value
    expect(atEnd.fullyDepreciated).toBe(true);

    const beyond = computeDepreciation(laptop, 48); // clamped to the useful life
    expect(beyond.netBookValueMinor).toBe(600000);
    expect(beyond.fullyDepreciated).toBe(true);
  });

  it("depreciates linearly at the midpoint", () => {
    const mid = computeDepreciation(laptop, 18);
    expect(mid.accumulatedDepreciationMinor).toBe(2700000); // half of 5,400,000
    expect(mid.netBookValueMinor).toBe(3300000);
  });

  it("never rises or drifts below salvage across the whole life", () => {
    let prev = 6000000;
    for (let m = 0; m <= 36; m += 1) {
      const r = computeDepreciation(laptop, m);
      expect(r.netBookValueMinor).toBeLessThanOrEqual(prev);
      expect(r.netBookValueMinor).toBeGreaterThanOrEqual(600000);
      prev = r.netBookValueMinor;
    }
  });

  it("rejects invalid inputs", () => {
    expect(() => computeDepreciation({ ...laptop, usefulLifeMonths: 0 }, 1)).toThrow(
      InvalidDepreciationError,
    );
    expect(() => computeDepreciation({ ...laptop, salvageValueMinor: 7000000 }, 1)).toThrow(
      InvalidDepreciationError,
    );
    expect(() => computeDepreciation({ ...laptop, acquisitionCostMinor: -1 }, 1)).toThrow(
      InvalidDepreciationError,
    );
    expect(() => computeDepreciation(laptop, -1)).toThrow(InvalidDepreciationError);
  });
});
