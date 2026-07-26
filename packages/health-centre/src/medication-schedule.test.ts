import { describe, expect, it } from "vitest";
import { computeMedicationSchedule, daysBetween } from "./medication-schedule";

describe("daysBetween", () => {
  it("counts whole days and is signed", () => {
    expect(daysBetween("2026-01-01", "2026-01-08")).toBe(7);
    expect(daysBetween("2026-01-08", "2026-01-01")).toBe(-7);
    expect(daysBetween("2026-01-01", "2026-01-01")).toBe(0);
  });
});

// A 3×/day course for 5 days = 15 total doses, starting 2026-01-01.
describe("computeMedicationSchedule", () => {
  it("owes nothing before the course starts", () => {
    const s = computeMedicationSchedule("2026-01-01", 3, 5, 0, "2025-12-31");
    expect(s.totalDoses).toBe(15);
    expect(s.dosesDue).toBe(0);
    expect(s.overdueDoses).toBe(0);
    expect(s.isActive).toBe(false); // not started yet
    expect(s.isComplete).toBe(false);
  });

  it("owes day one's doses on the start date", () => {
    const s = computeMedicationSchedule("2026-01-01", 3, 5, 0, "2026-01-01");
    expect(s.dosesDue).toBe(3);
    expect(s.overdueDoses).toBe(3); // none given yet
    expect(s.dosesRemaining).toBe(15);
    expect(s.isActive).toBe(true);
  });

  it("nets administered doses against those due (no overdue when kept up)", () => {
    // day three (2026-01-03): days one–three due = 9 doses; 9 administered
    const s = computeMedicationSchedule("2026-01-01", 3, 5, 9, "2026-01-03");
    expect(s.dosesDue).toBe(9);
    expect(s.overdueDoses).toBe(0);
    expect(s.dosesRemaining).toBe(6);
    expect(s.isActive).toBe(true);
  });

  it("surfaces overdue doses when the course falls behind", () => {
    // day four (2026-01-04): 12 due, only 5 given -> 7 overdue
    const s = computeMedicationSchedule("2026-01-01", 3, 5, 5, "2026-01-04");
    expect(s.dosesDue).toBe(12);
    expect(s.overdueDoses).toBe(7);
    expect(s.isActive).toBe(true);
  });

  it("caps due at the total after the course ends and stays active until complete", () => {
    const s = computeMedicationSchedule("2026-01-01", 3, 5, 10, "2026-02-01");
    expect(s.dosesDue).toBe(15); // capped at total
    expect(s.overdueDoses).toBe(5);
    expect(s.isActive).toBe(false); // past the 5-day window
    expect(s.isComplete).toBe(false);
  });

  it("is complete once every dose is administered", () => {
    const s = computeMedicationSchedule("2026-01-01", 3, 5, 15, "2026-01-05");
    expect(s.isComplete).toBe(true);
    expect(s.dosesRemaining).toBe(0);
    expect(s.isActive).toBe(false);
  });
});
