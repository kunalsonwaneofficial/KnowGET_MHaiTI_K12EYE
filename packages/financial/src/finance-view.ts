import type { AccountStanding, InvoiceStatus, PaymentStatus } from "./finance-value";

/**
 * The narrow views the pure engines consume. The aggregates structurally satisfy them, so the
 * engines depend on no aggregate — the same pure-engine-over-views pattern used across P2-D07…D13.
 * All amounts are integer minor units in a single currency per account.
 */

/**
 * The minimal view of an invoice the account-statement engine needs: its total is the charge, and
 * `amountPaidMinor` (defaulting to 0) is how much of it has already settled — the engine nets this
 * off an overdue charge so the overdue figure is the *outstanding* portion, never the gross total.
 */
export interface ChargeView {
  readonly amountMinor: number;
  readonly currency: string;
  readonly status: InvoiceStatus;
  readonly amountPaidMinor?: number;
}

/** The minimal view of a payment the account-statement engine needs. */
export interface CreditView {
  readonly amountMinor: number;
  readonly currency: string;
  readonly status: PaymentStatus;
}

/**
 * A student's account statement — billed (live charges), paid (cleared payments), the outstanding
 * balance (billed − paid, floored at zero) and the amount sitting in overdue invoices, all in minor
 * units, plus a descriptive standing. Descriptive and exact; the genuine read model of receivables.
 */
export interface AccountStatement {
  readonly currency: string;
  readonly totalBilledMinor: number;
  readonly totalPaidMinor: number;
  readonly outstandingMinor: number;
  readonly overdueMinor: number;
  readonly chargeCount: number;
  readonly standing: AccountStanding;
}

/** The minimal view of a student account the receivables rollup needs. */
export interface FinancialMemberView {
  readonly currency: string;
  readonly outstandingMinor: number;
  readonly overdueMinor: number;
  readonly standing: AccountStanding;
}

/**
 * A leadership-facing descriptive rollup of an organization's receivables — account count, total
 * outstanding and overdue (minor units), the standing distribution and the count in arrears
 * (overdue). Descriptive only; single currency.
 */
export interface ReceivablesSummary {
  readonly currency: string;
  readonly accountCount: number;
  readonly totalOutstandingMinor: number;
  readonly totalOverdueMinor: number;
  readonly standingDistribution: Readonly<Record<AccountStanding, number>>;
  readonly inArrearsCount: number;
}
