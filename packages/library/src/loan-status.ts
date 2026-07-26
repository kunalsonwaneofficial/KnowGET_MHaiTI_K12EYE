import type { LoanDueStatus } from "./library-view";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days from one date-only value to another (UTC), positive when `toDate` is later. */
export function daysBetween(fromDate: string, toDate: string): number {
  const from = new Date(fromDate).getTime();
  const to = new Date(toDate).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) {
    return 0;
  }
  return Math.round((to - from) / MS_PER_DAY);
}

/** A date-only (`YYYY-MM-DD`) value `days` after the given date (UTC). */
export function addDays(date: string, days: number): string {
  const base = new Date(date).getTime();
  if (Number.isNaN(base)) {
    return date;
  }
  return new Date(base + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * The pure loan-status engine — from a loan's captured terms (issue date, loan-period days, renewals used
 * and the renewal limit) and an as-of date, derives the **due date** (issue plus the loan period for each
 * term taken — one plus the renewals used), whether it is overdue and by how many whole days, the
 * renewals still available, and whether it can be renewed. Pure, deterministic and **clock-free** (the
 * caller passes the as-of date). The due date and overdue are never stored — always derived. Built and
 * tested before any aggregate depends on it. Money is not here: overdue is measured in **days**, never a
 * fine (fines are Finance, P2-D14).
 */
export function computeLoanStatus(
  issueDate: string,
  loanPeriodDays: number,
  renewalsUsed: number,
  renewalLimit: number,
  asOfDate: string,
): LoanDueStatus {
  const dueDate = addDays(issueDate, loanPeriodDays * (1 + renewalsUsed));
  const daysToDue = daysBetween(asOfDate, dueDate);
  const isOverdue = daysToDue < 0;
  const renewalsRemaining = Math.max(0, renewalLimit - renewalsUsed);
  return {
    dueDate,
    isOverdue,
    daysOverdue: isOverdue ? -daysToDue : 0,
    renewalsRemaining,
    canRenew: renewalsRemaining > 0,
  };
}
