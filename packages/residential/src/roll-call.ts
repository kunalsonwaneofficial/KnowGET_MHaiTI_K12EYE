import type { RollCallMarkView, RollCallSummary } from "./residential-view";

/**
 * The pure roll-call reconciliation engine — reconciles a curfew roll call's per-resident markings
 * against the expected roster into presence counts and the safety-critical unaccounted-for count. A
 * resident marked `present` or `late` is physically present; `on_leave` is excused elsewhere; `absent`
 * is unaccounted. Accounted-for = present + late + on_leave; unaccounted-for = expected − accounted-for
 * (the absent plus any resident not yet marked), floored at zero. It is the residential analog of the
 * trip-occupancy engine: a marking ledger reconciled into counts, safety-flagged. Pure, deterministic
 * and clock-free. Built and tested before any aggregate depends on it.
 */
export function computeRollCall(
  expectedCount: number,
  marks: readonly RollCallMarkView[],
): RollCallSummary {
  let presentCount = 0;
  let lateCount = 0;
  let onLeaveCount = 0;
  let absentCount = 0;
  for (const marking of marks) {
    switch (marking.mark) {
      case "present":
        presentCount += 1;
        break;
      case "late":
        lateCount += 1;
        break;
      case "on_leave":
        onLeaveCount += 1;
        break;
      default:
        absentCount += 1;
        break;
    }
  }
  const accountedForCount = presentCount + lateCount + onLeaveCount;
  const unaccountedForCount = Math.max(0, expectedCount - accountedForCount);
  return {
    expectedCount,
    markedCount: marks.length,
    presentCount,
    lateCount,
    onLeaveCount,
    absentCount,
    accountedForCount,
    unaccountedForCount,
    allAccountedFor: unaccountedForCount === 0,
  };
}
