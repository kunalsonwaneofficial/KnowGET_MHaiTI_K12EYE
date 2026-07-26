import type {
  CollectionMemberView,
  CollectionUtilization,
  CopyStatusView,
  TitleAvailability,
} from "./library-view";

/**
 * The pure title-availability engine — reduces a title's copy statuses into its availability picture:
 * the in-collection copy count (excludes withdrawn), how many are available, on loan or lost, whether it
 * is currently borrowable (`isAvailable`) and whether it should be reserved (`isReservable`: it has
 * loanable copies but none free right now). Pure and deterministic. Built and tested before any aggregate
 * depends on it.
 */
export function computeTitleAvailability(copies: readonly CopyStatusView[]): TitleAvailability {
  let availableCopies = 0;
  let onLoanCount = 0;
  let lostCount = 0;
  for (const copy of copies) {
    switch (copy.status) {
      case "available":
        availableCopies += 1;
        break;
      case "on_loan":
        onLoanCount += 1;
        break;
      case "lost":
        lostCount += 1;
        break;
      default:
        break; // withdrawn — not in the collection
    }
  }
  const totalCopies = availableCopies + onLoanCount + lostCount;
  const loanableCopies = availableCopies + onLoanCount;
  return {
    totalCopies,
    availableCopies,
    onLoanCount,
    lostCount,
    isAvailable: availableCopies > 0,
    isReservable: availableCopies === 0 && loanableCopies > 0,
  };
}

/**
 * The pure collection-utilization engine — rolls a collection's titles up into a single picture: title
 * count, total in-collection copies, available and on-loan counts, and the utilization percent (on loan
 * against loanable copies). Pure and deterministic.
 */
export function computeCollectionUtilization(
  members: readonly CollectionMemberView[],
): CollectionUtilization {
  let copyCount = 0;
  let availableCount = 0;
  let onLoanCount = 0;
  for (const member of members) {
    copyCount += member.copyCount;
    availableCount += member.availableCount;
    onLoanCount += member.onLoanCount;
  }
  const loanable = availableCount + onLoanCount;
  return {
    titleCount: members.length,
    copyCount,
    availableCount,
    onLoanCount,
    utilizationPercent: loanable > 0 ? Math.round((onLoanCount / loanable) * 100) : 0,
  };
}
