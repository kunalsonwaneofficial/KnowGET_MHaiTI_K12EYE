import { describe, expect, it } from "vitest";
import { addDays, computeLoanStatus, daysBetween } from "./loan-status";

describe("date helpers", () => {
  it("adds whole days in UTC", () => {
    expect(addDays("2026-01-01", 14)).toBe("2026-01-15");
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
  });

  it("measures whole days between dates", () => {
    expect(daysBetween("2026-01-01", "2026-01-15")).toBe(14);
    expect(daysBetween("2026-01-15", "2026-01-01")).toBe(-14);
  });
});

describe("computeLoanStatus", () => {
  it("derives the due date from issue plus one loan period (no renewals)", () => {
    const s = computeLoanStatus("2026-01-01", 14, 0, 2, "2026-01-10");
    expect(s.dueDate).toBe("2026-01-15");
    expect(s.isOverdue).toBe(false);
    expect(s.daysOverdue).toBe(0);
    expect(s.renewalsRemaining).toBe(2);
    expect(s.canRenew).toBe(true);
  });

  it("extends the due date by one loan period per renewal used", () => {
    const s = computeLoanStatus("2026-01-01", 14, 1, 2, "2026-01-20");
    expect(s.dueDate).toBe("2026-01-29"); // 14 * 2 days
    expect(s.renewalsRemaining).toBe(1);
    expect(s.canRenew).toBe(true);
  });

  it("flags overdue with the whole days past the due date", () => {
    const s = computeLoanStatus("2026-01-01", 14, 0, 2, "2026-01-20");
    expect(s.isOverdue).toBe(true);
    expect(s.daysOverdue).toBe(5); // due 01-15, asOf 01-20
  });

  it("blocks renewal once the renewal limit is reached", () => {
    const s = computeLoanStatus("2026-01-01", 14, 2, 2, "2026-01-10");
    expect(s.renewalsRemaining).toBe(0);
    expect(s.canRenew).toBe(false);
  });

  it("is due exactly on the due date without being overdue", () => {
    const s = computeLoanStatus("2026-01-01", 14, 0, 2, "2026-01-15");
    expect(s.isOverdue).toBe(false);
    expect(s.daysOverdue).toBe(0);
  });
});
