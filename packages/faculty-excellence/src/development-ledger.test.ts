import { describe, expect, it } from "vitest";
import { computeDevelopmentLedger } from "./development-ledger";
import type { DevelopmentActivityView, DevelopmentRequirementView } from "./faculty-view";

describe("computeDevelopmentLedger", () => {
  it("yields a fully-compliant empty ledger for no requirements or activities", () => {
    const ledger = computeDevelopmentLedger([], []);
    expect(ledger.lines).toHaveLength(0);
    expect(ledger.totalRequired).toBe(0);
    expect(ledger.totalCompleted).toBe(0);
    expect(ledger.complianceRate).toBe(100); // nothing required → vacuously compliant
  });

  it("reconciles requirements against completed activities (only completed earn hours)", () => {
    const requirements: DevelopmentRequirementView[] = [
      { category: "pedagogy", requiredHours: 20 },
      { category: "compliance", requiredHours: 10 },
    ];
    const activities: DevelopmentActivityView[] = [
      { category: "pedagogy", hours: 8, status: "completed" },
      { category: "pedagogy", hours: 5, status: "enrolled" }, // not counted
      { category: "compliance", hours: 12, status: "completed" }, // over-completed
      { category: "digital", hours: 4, status: "completed" }, // no requirement
      { category: "digital", hours: 3, status: "cancelled" }, // ignored
    ];
    const ledger = computeDevelopmentLedger(requirements, activities);

    // lines emitted in canonical PD_CATEGORIES order: pedagogy, digital, compliance
    expect(ledger.lines.map((l) => l.category)).toEqual(["pedagogy", "digital", "compliance"]);

    const pedagogy = ledger.lines.find((l) => l.category === "pedagogy");
    expect(pedagogy).toEqual({
      category: "pedagogy",
      required: 20,
      completed: 8,
      remaining: 12,
      compliancePct: 40, // 100 * 8 / 20
    });

    const compliance = ledger.lines.find((l) => l.category === "compliance");
    expect(compliance).toEqual({
      category: "compliance",
      required: 10,
      completed: 12,
      remaining: 0, // clamped
      compliancePct: 100, // clamped
    });

    const digital = ledger.lines.find((l) => l.category === "digital");
    expect(digital).toEqual({
      category: "digital",
      required: 0,
      completed: 4,
      remaining: 0,
      compliancePct: 100, // no requirement → vacuously compliant
    });

    expect(ledger.totalRequired).toBe(30);
    expect(ledger.totalCompleted).toBe(24); // raw sum of all completed hours (informational)
    expect(ledger.totalRemaining).toBe(12);
    // compliance credits only up to each requirement: min(8,20)+min(12,10)+min(4,0)=18 of 30 = 60
    // (the compliance surplus does NOT mask the pedagogy shortfall)
    expect(ledger.complianceRate).toBe(60);
  });
});
