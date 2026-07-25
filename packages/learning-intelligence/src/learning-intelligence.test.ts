import { describe, expect, it } from "vitest";
import { synthesizeLearnerInsight } from "./learning-intelligence";
import type { LearningSignalView } from "./insight-view";

describe("synthesizeLearnerInsight", () => {
  it("yields zeroes and no coverage for a learner with no signals", () => {
    const result = synthesizeLearnerInsight([]);
    expect(result.dimensions).toHaveLength(0);
    expect(result.overallScore).toBe(0);
    expect(result.signalsConsidered).toBe(0);
    expect(result.dimensionsCovered).toBe(0);
    // dimensionsCovered === 0 is the data-sufficiency signal; the band is not meaningful here.
    expect(result.overallBand).toBe("critical");
  });

  it("averages each dimension, bands it, and equal-weights covered dimensions", () => {
    const signals: LearningSignalView[] = [
      { dimension: "academic", value: 80 },
      { dimension: "academic", value: 90 },
      { dimension: "attendance", value: 40 },
    ];
    const result = synthesizeLearnerInsight(signals);

    expect(result.signalsConsidered).toBe(3);
    expect(result.dimensionsCovered).toBe(2);

    const academic = result.dimensions.find((d) => d.dimension === "academic");
    expect(academic).toEqual({
      dimension: "academic",
      score: 85,
      band: "on_track",
      signalCount: 2,
    });
    const attendance = result.dimensions.find((d) => d.dimension === "attendance");
    expect(attendance).toEqual({
      dimension: "attendance",
      score: 40,
      band: "at_risk",
      signalCount: 1,
    });

    // equal-weight overall: (85 + 40) / 2 = 62.5 → watch
    expect(result.overallScore).toBe(62.5);
    expect(result.overallBand).toBe("watch");
  });

  it("clamps out-of-range readings to 0–100 before averaging", () => {
    const result = synthesizeLearnerInsight([
      { dimension: "wellbeing", value: 120 },
      { dimension: "wellbeing", value: -20 },
    ]);
    // clamps to 100 and 0 → mean 50
    expect(result.dimensions[0]?.score).toBe(50);
    expect(result.dimensions[0]?.band).toBe("watch");
  });

  it("emits dimensions in the canonical order regardless of signal order", () => {
    const result = synthesizeLearnerInsight([
      { dimension: "progression", value: 70 },
      { dimension: "academic", value: 60 },
    ]);
    expect(result.dimensions.map((d) => d.dimension)).toEqual(["academic", "progression"]);
  });
});
