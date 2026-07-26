import type { CopyStatus } from "./library-value";

/**
 * The narrow views the pure engines consume. The aggregates structurally satisfy them, so the engines
 * depend on no aggregate — the same pure-engine-over-views pattern used across P2-D07…D17.
 */

// --- Availability engine ---------------------------------------------------------

/** The minimal view of a copy the availability engine needs (its status). */
export interface CopyStatusView {
  readonly status: CopyStatus;
}

/**
 * A title's availability — its total in-collection copies (excludes withdrawn) against how many are on
 * loan, available or lost, and whether it is currently borrowable (`isAvailable`) or should be reserved
 * (`isReservable`: in the collection but none free). Descriptive and exact.
 */
export interface TitleAvailability {
  readonly totalCopies: number;
  readonly availableCopies: number;
  readonly onLoanCount: number;
  readonly lostCount: number;
  readonly isAvailable: boolean;
  readonly isReservable: boolean;
}

/** The minimal view of a title's holdings the collection rollup needs. */
export interface CollectionMemberView {
  readonly copyCount: number;
  readonly availableCount: number;
  readonly onLoanCount: number;
}

/**
 * A collection's utilization — rolled up across its titles: title count, total in-collection copies,
 * available and on-loan counts, and the utilization percent (on loan against loanable copies).
 * Descriptive only.
 */
export interface CollectionUtilization {
  readonly titleCount: number;
  readonly copyCount: number;
  readonly availableCount: number;
  readonly onLoanCount: number;
  readonly utilizationPercent: number;
}

// --- Loan-status engine ----------------------------------------------------------

/**
 * A loan's circulation status as of a date — its **derived** due date (issue date plus the loan period
 * for each term already taken, i.e. one plus the renewals used), whether it is overdue and by how many
 * whole days, the renewals still available, and whether it can be renewed. Descriptive and exact;
 * computed from the loan's captured terms, never stored. Clock-free (the caller passes the as-of date).
 */
export interface LoanDueStatus {
  readonly dueDate: string;
  readonly isOverdue: boolean;
  readonly daysOverdue: number;
  readonly renewalsRemaining: number;
  readonly canRenew: boolean;
}
