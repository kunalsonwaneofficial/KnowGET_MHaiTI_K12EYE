/** Lifecycle of a fee structure (a fee schedule template) — components frozen once active. */
export const FEE_STRUCTURE_STATUSES = ["draft", "active", "archived"] as const;

export type FeeStructureStatus = (typeof FEE_STRUCTURE_STATUSES)[number];

/**
 * Lifecycle of an invoice: `draft` → `issued`, then `partially_paid` / `paid` as payments land, or
 * `overdue` if past due unpaid; `cancelled` voids it. Only issued-and-beyond invoices are billable.
 */
export const INVOICE_STATUSES = [
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "overdue",
  "cancelled",
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** The invoice statuses that represent a live charge on the account (exclude draft and cancelled). */
export const BILLABLE_INVOICE_STATUSES: readonly InvoiceStatus[] = [
  "issued",
  "partially_paid",
  "paid",
  "overdue",
];

/** Whether an invoice status is a live charge. */
export const isBillableInvoice = (status: InvoiceStatus): boolean =>
  BILLABLE_INVOICE_STATUSES.includes(status);

/** How a payment was made. */
export const PAYMENT_METHODS = [
  "cash",
  "card",
  "bank_transfer",
  "cheque",
  "online",
  "other",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Lifecycle of a payment. Only a `cleared` payment settles a charge; a `refunded` one reverses it. */
export const PAYMENT_STATUSES = ["pending", "cleared", "failed", "refunded"] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** The kind of concession — a percentage of the fee or a fixed amount. */
export const CONCESSION_TYPES = ["percentage", "fixed"] as const;

export type ConcessionType = (typeof CONCESSION_TYPES)[number];

/** Lifecycle of a concession (scholarship/discount): requested → approved | rejected; approved → revoked. */
export const CONCESSION_STATUSES = ["requested", "approved", "rejected", "revoked"] as const;

export type ConcessionStatus = (typeof CONCESSION_STATUSES)[number];

/** Lifecycle of an accounting period — postings are locked once it is closed. */
export const PERIOD_STATUSES = ["open", "closed"] as const;

export type PeriodStatus = (typeof PERIOD_STATUSES)[number];

/** Lifecycle of a payroll run (a batch for a period). */
export const PAYROLL_RUN_STATUSES = ["draft", "processed", "paid", "cancelled"] as const;

export type PayrollRunStatus = (typeof PAYROLL_RUN_STATUSES)[number];

/** Lifecycle of a payslip (an employee's compensation for a period). */
export const PAYSLIP_STATUSES = ["draft", "approved", "paid"] as const;

export type PayslipStatus = (typeof PAYSLIP_STATUSES)[number];

/** A student account's descriptive standing — settled, owing (current) or overdue. */
export const ACCOUNT_STANDINGS = ["settled", "outstanding", "overdue"] as const;

export type AccountStanding = (typeof ACCOUNT_STANDINGS)[number];
