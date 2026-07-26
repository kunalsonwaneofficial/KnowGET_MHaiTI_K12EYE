import { describe, expect, it } from "vitest";
import { computeComfortIndex } from "./comfort";
import type { ComfortThreshold } from "./facilities-view";

const thresholds: ComfortThreshold[] = [
  { metric: "temperature", min: 20, max: 26 },
  { metric: "humidity", min: 30, max: 60 },
  { metric: "co2", min: 0, max: 1000 },
];

describe("computeComfortIndex", () => {
  it("is comfortable when every reading is within range", () => {
    const a = computeComfortIndex(
      [
        { metric: "temperature", value: 22.5 },
        { metric: "humidity", value: 45 },
        { metric: "co2", value: 600 },
      ],
      thresholds,
    );
    expect(a.band).toBe("comfortable");
    expect(a.breachCount).toBe(0);
    expect(a.readingCount).toBe(3);
  });

  it("is marginal on a single breach (above max or below min)", () => {
    const hot = computeComfortIndex([{ metric: "temperature", value: 29 }], thresholds);
    expect(hot.band).toBe("marginal");
    expect(hot.breachingMetrics).toEqual(["temperature"]);
    const dry = computeComfortIndex([{ metric: "humidity", value: 20 }], thresholds);
    expect(dry.band).toBe("marginal");
    expect(dry.breachingMetrics).toEqual(["humidity"]);
  });

  it("is poor on two or more breaches", () => {
    const a = computeComfortIndex(
      [
        { metric: "temperature", value: 30 },
        { metric: "co2", value: 1400 },
        { metric: "humidity", value: 45 },
      ],
      thresholds,
    );
    expect(a.band).toBe("poor");
    expect(a.breachCount).toBe(2);
    expect(a.breachingMetrics).toContain("temperature");
    expect(a.breachingMetrics).toContain("co2");
  });

  it("ignores a metric with no configured threshold, and treats no readings as comfortable", () => {
    const noThreshold = computeComfortIndex([{ metric: "occupancy", value: 999 }], thresholds);
    expect(noThreshold.band).toBe("comfortable");
    expect(noThreshold.breachCount).toBe(0);
    expect(noThreshold.readingCount).toBe(1);
    expect(computeComfortIndex([], thresholds).band).toBe("comfortable");
  });
});
