import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { EmptyMetricNameError } from "./errors";
import {
  createWellbeingProfile,
  putSuccessMetric,
  removeSuccessMetric,
  setDimension,
  setLearningSupportIndicators,
  updateDimensions,
  updateIndicators,
} from "./wellbeing-profile";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;

const profile = () =>
  createWellbeingProfile({ tenantId: TENANT, organizationId: ORG, studentId: STUDENT });

describe("wellbeing profile aggregate", () => {
  it("creates an empty profile bound to the student and organization", () => {
    const p = profile();
    expect(p.tenantId).toBe(TENANT);
    expect(p.organizationId).toBe(ORG);
    expect(p.studentId).toBe(STUDENT);
    expect(p.dimensions).toEqual({
      physical: null,
      emotional: null,
      social: null,
      behavioural: null,
    });
    expect(p.learningSupportIndicators).toEqual([]);
    expect(p.successMetrics).toEqual([]);
    expect(p.indicators.wellbeingTrend).toBeNull();
  });

  it("sets a single dimension and merges a dimension patch", () => {
    const p = setDimension(profile(), "emotional", "monitor");
    expect(p.dimensions.emotional).toBe("monitor");
    const merged = updateDimensions(p, { physical: "thriving", social: "stable" });
    expect(merged.dimensions).toEqual({
      physical: "thriving",
      emotional: "monitor",
      social: "stable",
      behavioural: null,
    });
    expect(setDimension(merged, "emotional", null).dimensions.emotional).toBeNull();
  });

  it("normalizes learning-support indicators (trimmed, non-empty, deduplicated)", () => {
    const p = setLearningSupportIndicators(profile(), [" dyslexia ", "dyslexia", "  ", "adhd"]);
    expect(p.learningSupportIndicators).toEqual(["dyslexia", "adhd"]);
  });

  it("adds, replaces and removes named success metrics", () => {
    let p = putSuccessMetric(profile(), "attendance", 0.9);
    p = putSuccessMetric(p, "engagement", 0.7);
    expect(p.successMetrics).toHaveLength(2);
    p = putSuccessMetric(p, "attendance", 0.95);
    expect(p.successMetrics.filter((m) => m.name === "attendance")).toEqual([
      { name: "attendance", value: 0.95 },
    ]);
    p = removeSuccessMetric(p, "engagement");
    expect(p.successMetrics.map((m) => m.name)).toEqual(["attendance"]);
    expect(removeSuccessMetric(p, "missing").successMetrics).toHaveLength(1);
  });

  it("rejects a success metric with a blank name", () => {
    expect(() => putSuccessMetric(profile(), "   ", 1)).toThrow(EmptyMetricNameError);
  });

  it("merges a patch into the AI-ready indicators", () => {
    const p = updateIndicators(profile(), {
      wellbeingTrend: "improving",
      academicSignal: "steady",
    });
    expect(p.indicators.wellbeingTrend).toBe("improving");
    expect(p.indicators.academicSignal).toBe("steady");
    expect(p.indicators.engagementLevel).toBeNull();
  });
});
