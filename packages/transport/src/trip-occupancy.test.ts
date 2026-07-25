import { describe, expect, it } from "vitest";
import { computeTripOccupancy } from "./trip-occupancy";

const b = { type: "boarded" as const };
const a = { type: "alighted" as const };

describe("computeTripOccupancy", () => {
  it("reconciles boarding/alighting into running, peak and tallies", () => {
    // board 3, alight 1, board 2 → peak 4, final 4
    const occ = computeTripOccupancy(40, [b, b, b, a, b, b]);
    expect(occ.boardedCount).toBe(5);
    expect(occ.alightedCount).toBe(1);
    expect(occ.finalOnboard).toBe(4);
    expect(occ.peakOccupancy).toBe(4);
    expect(occ.capacityExceeded).toBe(false);
    expect(occ.eventCount).toBe(6);
  });

  it("flags exceeding capacity at the peak, not just at the end", () => {
    // capacity 2: board 3 (peak 3 > 2) then alight 2 (final 1) — still flagged
    const occ = computeTripOccupancy(2, [b, b, b, a, a]);
    expect(occ.peakOccupancy).toBe(3);
    expect(occ.finalOnboard).toBe(1);
    expect(occ.capacityExceeded).toBe(true);
    expect(occ.utilizationPercent).toBe(150);
  });

  it("is empty-safe and computes utilization against capacity", () => {
    expect(computeTripOccupancy(40, [])).toEqual({
      capacity: 40,
      finalOnboard: 0,
      peakOccupancy: 0,
      boardedCount: 0,
      alightedCount: 0,
      eventCount: 0,
      capacityExceeded: false,
      utilizationPercent: 0,
    });
    expect(computeTripOccupancy(50, [b, b, b, b, b]).utilizationPercent).toBe(10);
  });
});
