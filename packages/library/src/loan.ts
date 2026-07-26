import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { InvalidLoanTransitionError, NoRenewalsRemainingError } from "./errors";
import { computeLoanStatus } from "./loan-status";
import type { LoanStatus } from "./library-value";
import type { LoanDueStatus } from "./library-view";

/**
 * A loan — a {@link Copy} issued to a {@link LibraryMember}. It captures the loan terms at issue (the loan
 * period and renewal limit resolved from the circulation policy for the member's category, snapshotted so
 * the loan is self-describing, like a trip capturing its capacity). It runs `active → returned`, or →
 * `lost`. The due date and overdue are **derived** from the captured terms by the pure engine, never
 * stored. The organization and title are derived from the copy. Money is not here: overdue is measured in
 * days (fines are Finance, P2-D14).
 */
export interface Loan {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly copyId: Uuid;
  readonly titleId: Uuid;
  readonly memberId: Uuid;
  readonly issueDate: string;
  readonly loanPeriodDays: number;
  readonly renewalLimit: number;
  readonly renewalsUsed: number;
  readonly returnedDate: string | null;
  readonly status: LoanStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface IssueLoanParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly copyId: Uuid;
  readonly titleId: Uuid;
  readonly memberId: Uuid;
  readonly issueDate: string;
  readonly loanPeriodDays: number;
  readonly renewalLimit: number;
}

/** Issue a loan (status `active`, no renewals used). */
export function issueLoan(params: IssueLoanParams): Loan {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    copyId: params.copyId,
    titleId: params.titleId,
    memberId: params.memberId,
    issueDate: params.issueDate,
    loanPeriodDays: params.loanPeriodDays,
    renewalLimit: params.renewalLimit,
    renewalsUsed: 0,
    returnedDate: null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (loan: Loan, patch: Partial<Loan>): Loan => ({
  ...loan,
  ...patch,
  updatedAt: nowIso(),
});

/** Renew an active loan, extending the due date by one loan period. Rejected once the limit is reached. */
export function renewLoan(loan: Loan): Loan {
  if (loan.status !== "active") {
    throw new InvalidLoanTransitionError(loan.status, "active");
  }
  if (loan.renewalsUsed >= loan.renewalLimit) {
    throw new NoRenewalsRemainingError(loan.id);
  }
  return touch(loan, { renewalsUsed: loan.renewalsUsed + 1 });
}

/** Return an active loan (→ `returned`), stamping the return date. */
export function returnLoan(loan: Loan, returnedDate?: string): Loan {
  if (loan.status !== "active") {
    throw new InvalidLoanTransitionError(loan.status, "returned");
  }
  return touch(loan, {
    status: "returned",
    returnedDate: returnedDate?.trim() || nowIso().slice(0, 10),
  });
}

/** Mark an active loan's copy lost (→ `lost`, terminal). */
export function markLoanLost(loan: Loan): Loan {
  if (loan.status !== "active") {
    throw new InvalidLoanTransitionError(loan.status, "lost");
  }
  return touch(loan, { status: "lost" });
}

/** Whether the loan is currently active (out). */
export const isLoanActive = (loan: Loan): boolean => loan.status === "active";

/** The loan's circulation status as of a date (due date, overdue, renewals) via the pure engine. */
export const loanDueStatus = (loan: Loan, asOfDate: string): LoanDueStatus =>
  computeLoanStatus(
    loan.issueDate,
    loan.loanPeriodDays,
    loan.renewalsUsed,
    loan.renewalLimit,
    asOfDate,
  );

/** Whether the loan is active and overdue as of a date (a returned loan is never overdue). */
export const isLoanOverdue = (loan: Loan, asOfDate: string): boolean =>
  loan.status === "active" && loanDueStatus(loan, asOfDate).isOverdue;
