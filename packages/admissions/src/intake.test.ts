import { describe, expect, it } from "vitest";
import { computeIntakeCapacity, summarizeIntake } from "./intake";

describe("computeIntakeCapacity", () => {
  it("values confirmed, remaining and a fill percent", () => {
    expect(computeIntakeCapacity(40, 30)).toEqual({
      capacity: 40,
      confirmedCount: 30,
      remaining: 10,
      overSubscribed: false,
      fillPercent: 75,
    });
  });

  it("flags over-subscription and caps the fill percent at 100", () => {
    const intake = computeIntakeCapacity(20, 25);
    expect(intake.remaining).toBe(0);
    expect(intake.overSubscribed).toBe(true);
    expect(intake.fillPercent).toBe(100);
  });

  it("treats a capacity of zero as not-tracked (no cap, 0%)", () => {
    expect(computeIntakeCapacity(0, 5)).toEqual({
      capacity: 0,
      confirmedCount: 5,
      remaining: 0,
      overSubscribed: false,
      fillPercent: 0,
    });
  });
});

describe("summarizeIntake", () => {
  it("rolls grades into a cycle picture with an overall fill percent", () => {
    const summary = summarizeIntake([
      { capacity: 40, confirmedCount: 30 },
      { capacity: 60, confirmedCount: 30 },
    ]);
    expect(summary).toEqual({
      gradeCount: 2,
      totalCapacity: 100,
      totalConfirmed: 60,
      fillPercent: 60,
    });
  });

  it("is empty-safe (no grades ⇒ zero everything, 0%)", () => {
    expect(summarizeIntake([])).toEqual({
      gradeCount: 0,
      totalCapacity: 0,
      totalConfirmed: 0,
      fillPercent: 0,
    });
  });
});
