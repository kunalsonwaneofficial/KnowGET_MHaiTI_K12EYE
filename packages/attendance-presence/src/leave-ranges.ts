import type { LeaveView } from "./evaluation";

/**
 * Approved-leave date arithmetic shared by the policy-evaluation and presence-intelligence
 * engines, so both excuse the same leave-covered days. Internal to the package — not part of
 * the public barrel.
 */

/** A closed date range `[fromDate, toDate]` in ISO `YYYY-MM-DD` form. */
export interface DateRange {
  readonly fromDate: string;
  readonly toDate: string;
}

/** Approved-leave ranges from a leave list (ISO dates compare correctly as strings). */
export const approvedRanges = (leaves: readonly LeaveView[]): DateRange[] =>
  leaves
    .filter((leave) => leave.status === "approved")
    .map((leave) => ({ fromDate: leave.fromDate, toDate: leave.toDate }));

/** Whether `date` falls within any of the given closed ranges. */
export const withinAnyRange = (date: string, ranges: readonly DateRange[]): boolean =>
  ranges.some((range) => range.fromDate <= date && date <= range.toDate);
