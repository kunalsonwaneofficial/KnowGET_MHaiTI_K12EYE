import { describe, expect, it } from "vitest";
import { computeEventParticipation, summarizeParticipation } from "./participation";

describe("computeEventParticipation", () => {
  it("values fill, remaining and attendance for a tracked event", () => {
    expect(computeEventParticipation(100, 80, 60)).toEqual({
      capacity: 100,
      registeredCount: 80,
      attendedCount: 60,
      remaining: 20,
      overSubscribed: false,
      fillPercent: 80,
      attendanceRate: 75, // 60/80
    });
  });

  it("treats capacity 0 as untracked (no cap) but still values attendance", () => {
    expect(computeEventParticipation(0, 10, 5)).toEqual({
      capacity: 0,
      registeredCount: 10,
      attendedCount: 5,
      remaining: 0,
      overSubscribed: false,
      fillPercent: 0,
      attendanceRate: 50,
    });
  });

  it("flags over-subscription and caps the fill at 100", () => {
    const p = computeEventParticipation(50, 60, 40);
    expect(p.overSubscribed).toBe(true);
    expect(p.remaining).toBe(0);
    expect(p.fillPercent).toBe(100);
    expect(p.attendanceRate).toBe(67); // round(40/60*100)
  });

  it("is safe when nobody registered", () => {
    expect(computeEventParticipation(10, 0, 0)).toMatchObject({
      fillPercent: 0,
      attendanceRate: 0,
      remaining: 10,
    });
  });
});

describe("summarizeParticipation", () => {
  it("is empty-safe", () => {
    expect(summarizeParticipation([])).toEqual({
      eventCount: 0,
      totalCapacity: 0,
      totalRegistered: 0,
      totalAttended: 0,
      overallFillPercent: 0,
      overallAttendanceRate: 0,
    });
  });

  it("rolls up totals and overall fill / attendance", () => {
    const summary = summarizeParticipation([
      { capacity: 100, registeredCount: 80, attendedCount: 60 },
      { capacity: 100, registeredCount: 40, attendedCount: 30 },
    ]);
    expect(summary.eventCount).toBe(2);
    expect(summary.totalCapacity).toBe(200);
    expect(summary.totalRegistered).toBe(120);
    expect(summary.totalAttended).toBe(90);
    expect(summary.overallFillPercent).toBe(60); // 120/200
    expect(summary.overallAttendanceRate).toBe(75); // 90/120
  });

  it("counts only capacity-tracked events toward the overall fill (untracked don't inflate it)", () => {
    const summary = summarizeParticipation([
      { capacity: 100, registeredCount: 50, attendedCount: 40 },
      { capacity: 0, registeredCount: 30, attendedCount: 20 }, // untracked — excluded from fill
    ]);
    expect(summary.totalCapacity).toBe(100);
    expect(summary.totalRegistered).toBe(80); // both events' registrations reported
    expect(summary.totalAttended).toBe(60);
    expect(summary.overallFillPercent).toBe(50); // only the tracked 50/100, not 80/100
    expect(summary.overallAttendanceRate).toBe(75); // 60/80 over all registrations
  });
});
