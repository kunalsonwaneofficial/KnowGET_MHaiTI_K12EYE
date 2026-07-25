import { describe, expect, it } from "vitest";
import { DEFAULT_EARLY_WARNING_RULES, evaluateEarlyWarnings } from "./early-warning-rules";
import type { DimensionScore } from "./insight-value";
import type { EarlyWarningRule } from "./insight-view";

const score = (
  dimension: DimensionScore["dimension"],
  value: number,
  band: DimensionScore["band"],
): DimensionScore => ({ dimension, score: value, band, signalCount: 1 });

describe("evaluateEarlyWarnings", () => {
  it("fires the rules a dimension's score trips, most severe (lowest score) first", () => {
    const scores: DimensionScore[] = [
      score("academic", 40, "at_risk"),
      score("attendance", 20, "critical"),
    ];
    const fired = evaluateEarlyWarnings(scores, DEFAULT_EARLY_WARNING_RULES);

    const ids = fired.map((f) => f.ruleId);
    // academic 40 ≤ 49.99 (at_risk) but > 24.99 (not critical); attendance 20 ≤ both thresholds
    expect(ids).toContain("academic-at-risk");
    expect(ids).not.toContain("academic-critical");
    expect(ids).toContain("attendance-at-risk");
    expect(ids).toContain("attendance-critical");
    expect(fired).toHaveLength(3);
    // ordered by ascending observed score (most severe first): the two 20s precede the 40
    expect(fired[0]?.observedScore).toBe(20);
    expect(fired[fired.length - 1]?.ruleId).toBe("academic-at-risk");
  });

  it("never fires on a dimension the learner has no score for", () => {
    const fired = evaluateEarlyWarnings(
      [score("academic", 10, "critical")],
      DEFAULT_EARLY_WARNING_RULES,
    );
    // only academic rules can fire; attendance/wellbeing/etc. are absent, so skipped
    expect(fired.every((f) => f.dimension === "academic")).toBe(true);
    expect(fired.map((f) => f.ruleId).sort()).toEqual(["academic-at-risk", "academic-critical"]);
  });

  it("does not fire when every score is above its rule threshold", () => {
    const fired = evaluateEarlyWarnings(
      [score("academic", 88, "on_track"), score("attendance", 76, "on_track")],
      DEFAULT_EARLY_WARNING_RULES,
    );
    expect(fired).toHaveLength(0);
  });

  it("honours custom institution rules", () => {
    const custom: EarlyWarningRule[] = [
      { id: "engagement-watch", dimension: "engagement", maxScore: 70, severity: "watch" },
    ];
    const fired = evaluateEarlyWarnings([score("engagement", 65, "watch")], custom);
    expect(fired).toEqual([
      { ruleId: "engagement-watch", dimension: "engagement", observedScore: 65, severity: "watch" },
    ]);
  });
});
