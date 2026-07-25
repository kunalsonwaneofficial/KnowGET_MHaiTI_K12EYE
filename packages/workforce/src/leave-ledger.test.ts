import { describe, expect, it } from "vitest";
import { computeLeaveLedger } from "./leave-ledger";
import type { LeaveEntitlementView, LeaveRequestView } from "./workforce-view";

describe("computeLeaveLedger", () => {
  it("yields an empty ledger for no entitlements or requests", () => {
    const ledger = computeLeaveLedger([], []);
    expect(ledger.lines).toHaveLength(0);
    expect(ledger.totalEntitled).toBe(0);
    expect(ledger.totalTaken).toBe(0);
    expect(ledger.utilizationRate).toBe(0);
  });

  it("reconciles entitlements against approved (taken) and requested (pending) leave", () => {
    const entitlements: LeaveEntitlementView[] = [
      { leaveType: "annual", entitledDays: 20 },
      { leaveType: "sick", entitledDays: 10 },
    ];
    const requests: LeaveRequestView[] = [
      { leaveType: "annual", days: 5, status: "approved" },
      { leaveType: "annual", days: 3, status: "requested" },
      { leaveType: "annual", days: 10, status: "rejected" }, // ignored
      { leaveType: "sick", days: 12, status: "approved" }, // over-taken
      { leaveType: "casual", days: 2, status: "approved" }, // no entitlement
    ];
    const ledger = computeLeaveLedger(entitlements, requests);

    // lines emitted in canonical LEAVE_TYPES order: annual, sick, casual
    expect(ledger.lines.map((l) => l.leaveType)).toEqual(["annual", "sick", "casual"]);

    const annual = ledger.lines.find((l) => l.leaveType === "annual");
    expect(annual).toEqual({
      leaveType: "annual",
      entitled: 20,
      taken: 5,
      pending: 3,
      remaining: 15,
    });

    const sick = ledger.lines.find((l) => l.leaveType === "sick");
    expect(sick).toEqual({ leaveType: "sick", entitled: 10, taken: 12, pending: 0, remaining: 0 }); // clamped

    const casual = ledger.lines.find((l) => l.leaveType === "casual");
    expect(casual).toEqual({
      leaveType: "casual",
      entitled: 0,
      taken: 2,
      pending: 0,
      remaining: 0,
    });

    expect(ledger.totalEntitled).toBe(30);
    expect(ledger.totalTaken).toBe(19);
    expect(ledger.totalPending).toBe(3);
    expect(ledger.totalRemaining).toBe(15);
    // 100 * 19 / 30 = 63.33
    expect(ledger.utilizationRate).toBe(63.33);
  });
});
