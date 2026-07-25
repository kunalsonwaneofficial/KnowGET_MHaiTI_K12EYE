import { describe, expect, it } from "vitest";
import type { GradeBand } from "./assessment-framework-value";
import { computeGpa, computePercentage, gradeFor, gradeMarks } from "./grading";

const bands: GradeBand[] = [
  { label: "A+", minPercentage: 90, gpa: 10 },
  { label: "A", minPercentage: 80, gpa: 9 },
  { label: "B", minPercentage: 70, gpa: 8 },
  { label: "C", minPercentage: 60, gpa: 7 },
  { label: "F", minPercentage: 0, gpa: 0 },
];

describe("grading", () => {
  it("computes a division-safe, clamped percentage", () => {
    expect(computePercentage(45, 50)).toBe(90);
    expect(computePercentage(1, 3)).toBe(33.33);
    expect(computePercentage(5, 0)).toBe(0); // division-safe
    expect(computePercentage(60, 50)).toBe(100); // clamped
  });

  it("picks the highest-minimum band a percentage earns", () => {
    expect(gradeFor(95, bands)?.label).toBe("A+");
    expect(gradeFor(80, bands)?.label).toBe("A");
    expect(gradeFor(72, bands)?.label).toBe("B");
    expect(gradeFor(0, bands)?.label).toBe("F");
  });

  it("returns null when no band matches", () => {
    const strict: GradeBand[] = [{ label: "A", minPercentage: 90, gpa: 10 }];
    expect(gradeFor(50, strict)).toBeNull();
  });

  it("grades marks into percentage, grade and gpa together", () => {
    expect(gradeMarks(41, 50, bands)).toEqual({ percentage: 82, grade: "A", gpa: 9 });
  });

  it("computes a credit-weighted GPA", () => {
    // (9*4 + 7*2) / (4+2) = 50/6 = 8.33
    const gpa = computeGpa([
      { gpa: 9, credits: 4 },
      { gpa: 7, credits: 2 },
    ]);
    expect(gpa).toBe(8.33);
  });

  it("falls back to a simple average when there are no credits", () => {
    const gpa = computeGpa([
      { gpa: 8, credits: 0 },
      { gpa: 10, credits: 0 },
    ]);
    expect(gpa).toBe(9);
  });

  it("ignores ungraded entries and yields 0 for an empty set", () => {
    expect(computeGpa([{ gpa: null, credits: 3 }])).toBe(0);
    expect(computeGpa([])).toBe(0);
  });
});
