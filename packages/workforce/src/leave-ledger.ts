import { LEAVE_TYPES, type LeaveType } from "./workforce-value";
import type {
  LeaveEntitlementView,
  LeaveLedger,
  LeaveLedgerLine,
  LeaveRequestView,
} from "./workforce-view";

/**
 * The pure leave-ledger engine — reconciles a staff member's leave entitlements against their leave
 * requests into a per-type ledger (entitled, taken, pending, remaining) plus totals and a
 * utilization rate. Only **approved** requests draw down the balance; `requested` requests are
 * counted as pending; rejected and cancelled requests are ignored. Pure and deterministic; every
 * total is division-safe, non-negative and (for the rate) two-decimal and clamped to 0–100. This is
 * the genuine computational core of staff leave — built and tested before any aggregate depends on
 * it.
 */
export function computeLeaveLedger(
  entitlements: readonly LeaveEntitlementView[],
  requests: readonly LeaveRequestView[],
): LeaveLedger {
  const round = (value: number): number => Math.round(value * 100) / 100;
  const days = (value: number): number => Math.max(0, value);

  const entitledByType = new Map<LeaveType, number>();
  for (const e of entitlements) {
    entitledByType.set(e.leaveType, (entitledByType.get(e.leaveType) ?? 0) + days(e.entitledDays));
  }

  const present = new Set<LeaveType>([...entitledByType.keys()]);
  for (const r of requests) {
    present.add(r.leaveType);
  }

  const lines: LeaveLedgerLine[] = [];
  for (const leaveType of LEAVE_TYPES) {
    if (!present.has(leaveType)) {
      continue;
    }
    const entitled = round(entitledByType.get(leaveType) ?? 0);
    const taken = round(
      requests
        .filter((r) => r.leaveType === leaveType && r.status === "approved")
        .reduce((sum, r) => sum + days(r.days), 0),
    );
    const pending = round(
      requests
        .filter((r) => r.leaveType === leaveType && r.status === "requested")
        .reduce((sum, r) => sum + days(r.days), 0),
    );
    lines.push({
      leaveType,
      entitled,
      taken,
      pending,
      remaining: round(Math.max(0, entitled - taken)),
    });
  }

  const totalEntitled = round(lines.reduce((sum, l) => sum + l.entitled, 0));
  const totalTaken = round(lines.reduce((sum, l) => sum + l.taken, 0));
  const totalPending = round(lines.reduce((sum, l) => sum + l.pending, 0));
  const totalRemaining = round(lines.reduce((sum, l) => sum + l.remaining, 0));
  const utilizationRate =
    totalEntitled > 0 ? round(Math.min(100, (100 * totalTaken) / totalEntitled)) : 0;

  return { lines, totalEntitled, totalTaken, totalPending, totalRemaining, utilizationRate };
}
