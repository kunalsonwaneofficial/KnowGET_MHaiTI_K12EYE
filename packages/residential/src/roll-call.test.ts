import { describe, expect, it } from "vitest";
import { computeRollCall } from "./roll-call";
import type { RollCallMarkView } from "./residential-view";

const marks = (...ms: RollCallMarkView["mark"][]): RollCallMarkView[] =>
  ms.map((mark) => ({ mark }));

describe("computeRollCall", () => {
  it("reconciles a fully-accounted roll call (present, late and on-leave all count)", () => {
    const summary = computeRollCall(4, marks("present", "present", "late", "on_leave"));
    expect(summary).toEqual({
      expectedCount: 4,
      markedCount: 4,
      presentCount: 2,
      lateCount: 1,
      onLeaveCount: 1,
      absentCount: 0,
      accountedForCount: 4,
      unaccountedForCount: 0,
      allAccountedFor: true,
    });
  });

  it("counts an absent resident as unaccounted-for", () => {
    const summary = computeRollCall(3, marks("present", "present", "absent"));
    expect(summary.absentCount).toBe(1);
    expect(summary.accountedForCount).toBe(2);
    expect(summary.unaccountedForCount).toBe(1);
    expect(summary.allAccountedFor).toBe(false);
  });

  it("counts residents on the roster who were never marked as unaccounted-for", () => {
    // 5 expected, only 3 marked (all present) — 2 unmarked are unaccounted.
    const summary = computeRollCall(5, marks("present", "present", "present"));
    expect(summary.markedCount).toBe(3);
    expect(summary.accountedForCount).toBe(3);
    expect(summary.unaccountedForCount).toBe(2);
    expect(summary.allAccountedFor).toBe(false);
  });

  it("floors unaccounted-for at zero when more are accounted for than expected", () => {
    // Defensive: marks exceeding the captured roster never yield a negative unaccounted count.
    const summary = computeRollCall(1, marks("present", "on_leave"));
    expect(summary.accountedForCount).toBe(2);
    expect(summary.unaccountedForCount).toBe(0);
    expect(summary.allAccountedFor).toBe(true);
  });

  it("treats an empty roll call as fully accounted for (nothing outstanding)", () => {
    expect(computeRollCall(0, [])).toEqual({
      expectedCount: 0,
      markedCount: 0,
      presentCount: 0,
      lateCount: 0,
      onLeaveCount: 0,
      absentCount: 0,
      accountedForCount: 0,
      unaccountedForCount: 0,
      allAccountedFor: true,
    });
  });
});
