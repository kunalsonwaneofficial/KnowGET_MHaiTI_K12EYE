import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateInvoiceLineKeyError,
  EmptyInvoiceError,
  EmptyInvoiceNumberError,
  InvalidCurrencyError,
  InvalidInvoiceTransitionError,
  InvoiceHasPaymentsError,
  InvoiceLineNotFoundError,
  InvoiceNotEditableError,
  InvoiceNotPayableError,
  PaymentExceedsOutstandingError,
  ReversalExceedsPaidError,
} from "./errors";
import type { InvoiceStatus } from "./finance-value";
import { type InvoiceLine, type InvoiceLineInput, makeInvoiceLine } from "./invoice-line";
import { isCurrencyCode, type Money, money } from "./money";

/**
 * An invoice — a bill issued to a student for a set of {@link InvoiceLine} charges in a single
 * currency. It runs `draft → issued`, then tracks payment as `partially_paid` / `paid` (or `overdue`
 * if past due unpaid); `cancelled` voids it. Lines are editable **only while draft** and frozen once
 * issued. `amountPaidMinor` is the running total of cleared payments applied, kept in step with the
 * status by {@link applyPaymentToInvoice} / {@link reversePaymentFromInvoice}. `feeStructureId`
 * records the schedule it was generated from, if any.
 */
export interface Invoice {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly feeStructureId: Uuid | null;
  readonly number: string;
  readonly currency: string;
  readonly lines: readonly InvoiceLine[];
  readonly status: InvoiceStatus;
  readonly amountPaidMinor: number;
  readonly dueDate: string;
  readonly notes: string | null;
  readonly issuedAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface DraftInvoiceParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly number: string;
  readonly currency: string;
  readonly dueDate: string;
  readonly feeStructureId?: Uuid | null;
  readonly notes?: string | null;
  readonly lines?: readonly InvoiceLineInput[];
}

/** The invoice statuses that can accept or reverse a payment. */
const PAYABLE_STATUSES: readonly InvoiceStatus[] = ["issued", "partially_paid", "overdue"];

/** Build the line list, rejecting duplicate keys. */
function buildLines(inputs: readonly InvoiceLineInput[]): InvoiceLine[] {
  const seen = new Set<string>();
  const lines: InvoiceLine[] = [];
  for (const input of inputs) {
    const line = makeInvoiceLine(input);
    if (seen.has(line.key)) {
      throw new DuplicateInvoiceLineKeyError(line.key);
    }
    seen.add(line.key);
    lines.push(line);
  }
  return lines;
}

/** Draft an invoice (status `draft`, nothing paid). Number and a valid currency required. */
export function draftInvoice(params: DraftInvoiceParams): Invoice {
  const number = params.number.trim();
  if (number.length === 0) {
    throw new EmptyInvoiceNumberError();
  }
  if (!isCurrencyCode(params.currency)) {
    throw new InvalidCurrencyError(params.currency);
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    studentId: params.studentId,
    feeStructureId: params.feeStructureId ?? null,
    number,
    currency: params.currency,
    lines: buildLines(params.lines ?? []),
    status: "draft",
    amountPaidMinor: 0,
    dueDate: params.dueDate,
    notes: params.notes?.trim() || null,
    issuedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (invoice: Invoice, patch: Partial<Invoice>): Invoice => ({
  ...invoice,
  ...patch,
  updatedAt: nowIso(),
});

const requireDraft = (invoice: Invoice): void => {
  if (invoice.status !== "draft") {
    throw new InvoiceNotEditableError(invoice.id, invoice.status);
  }
};

/** The invoice total (sum of line amounts) in minor units. */
export function invoiceTotalMinor(invoice: Invoice): number {
  return invoice.lines.reduce((sum, line) => sum + line.amountMinor, 0);
}

/** The invoice total as {@link Money}. */
export const invoiceTotal = (invoice: Invoice): Money =>
  money(invoiceTotalMinor(invoice), invoice.currency);

/** The outstanding balance (total − paid, floored at zero) in minor units. */
export function invoiceOutstandingMinor(invoice: Invoice): number {
  return Math.max(0, invoiceTotalMinor(invoice) - invoice.amountPaidMinor);
}

/** The outstanding balance as {@link Money}. */
export const invoiceOutstanding = (invoice: Invoice): Money =>
  money(invoiceOutstandingMinor(invoice), invoice.currency);

/** Set (or clear) the invoice notes. */
export const setInvoiceNotes = (invoice: Invoice, notes: string | null): Invoice =>
  touch(invoice, { notes: notes?.trim() || null });

/** Add a line to a draft invoice (unique key). */
export function addInvoiceLine(invoice: Invoice, input: InvoiceLineInput): Invoice {
  requireDraft(invoice);
  const line = makeInvoiceLine(input);
  if (invoice.lines.some((l) => l.key === line.key)) {
    throw new DuplicateInvoiceLineKeyError(line.key);
  }
  return touch(invoice, { lines: [...invoice.lines, line] });
}

/** Remove a line from a draft invoice. */
export function removeInvoiceLine(invoice: Invoice, key: string): Invoice {
  requireDraft(invoice);
  if (!invoice.lines.some((l) => l.key === key)) {
    throw new InvoiceLineNotFoundError(key);
  }
  return touch(invoice, { lines: invoice.lines.filter((l) => l.key !== key) });
}

/** Change a line's amount on a draft invoice. */
export function updateInvoiceLineAmount(
  invoice: Invoice,
  key: string,
  amountMinor: number,
): Invoice {
  requireDraft(invoice);
  const existing = invoice.lines.find((l) => l.key === key);
  if (!existing) {
    throw new InvoiceLineNotFoundError(key);
  }
  const updated = makeInvoiceLine({ ...existing, amountMinor });
  return touch(invoice, { lines: invoice.lines.map((l) => (l.key === key ? updated : l)) });
}

/** Issue a draft invoice (→ `issued`), freezing its lines. Requires at least one line. */
export function issueInvoice(invoice: Invoice): Invoice {
  if (invoice.status !== "draft") {
    throw new InvalidInvoiceTransitionError(invoice.status, "issued");
  }
  if (invoice.lines.length === 0) {
    throw new EmptyInvoiceError();
  }
  return touch(invoice, { status: "issued", issuedAt: nowIso() });
}

/** Flag an unpaid issued/partially-paid invoice as `overdue`. */
export function markInvoiceOverdue(invoice: Invoice): Invoice {
  if (invoice.status !== "issued" && invoice.status !== "partially_paid") {
    throw new InvalidInvoiceTransitionError(invoice.status, "overdue");
  }
  return touch(invoice, { status: "overdue" });
}

/** Cancel an invoice with no payments applied (→ `cancelled`). */
export function cancelInvoice(invoice: Invoice): Invoice {
  if (invoice.status === "paid" || invoice.status === "cancelled") {
    throw new InvalidInvoiceTransitionError(invoice.status, "cancelled");
  }
  if (invoice.amountPaidMinor > 0) {
    throw new InvoiceHasPaymentsError(invoice.id);
  }
  return touch(invoice, { status: "cancelled" });
}

/**
 * Apply a cleared payment of `amountMinor` to the invoice — raises the paid amount and recomputes the
 * status (`partially_paid` or `paid`). The invoice must be payable and the payment must not exceed the
 * outstanding balance (overpayment is rejected). Pure and exact.
 */
export function applyPaymentToInvoice(invoice: Invoice, amountMinor: number): Invoice {
  if (!PAYABLE_STATUSES.includes(invoice.status)) {
    throw new InvoiceNotPayableError(invoice.id, invoice.status);
  }
  const total = invoiceTotalMinor(invoice);
  const newPaid = invoice.amountPaidMinor + amountMinor;
  if (newPaid > total) {
    throw new PaymentExceedsOutstandingError(
      invoice.id,
      total - invoice.amountPaidMinor,
      amountMinor,
    );
  }
  const status: InvoiceStatus = newPaid >= total ? "paid" : "partially_paid";
  return touch(invoice, { amountPaidMinor: newPaid, status });
}

/**
 * Reverse a cleared payment of `amountMinor` from the invoice (a refund) — lowers the paid amount and
 * recomputes the status. The reversal must not take the paid amount below zero. Pure and exact.
 */
export function reversePaymentFromInvoice(invoice: Invoice, amountMinor: number): Invoice {
  if (!PAYABLE_STATUSES.includes(invoice.status) && invoice.status !== "paid") {
    throw new InvoiceNotPayableError(invoice.id, invoice.status);
  }
  const newPaid = invoice.amountPaidMinor - amountMinor;
  if (newPaid < 0) {
    throw new ReversalExceedsPaidError(invoice.id, invoice.amountPaidMinor, amountMinor);
  }
  const total = invoiceTotalMinor(invoice);
  let status: InvoiceStatus;
  if (newPaid >= total) {
    status = "paid";
  } else if (newPaid > 0) {
    status = "partially_paid";
  } else {
    status = invoice.status === "overdue" ? "overdue" : "issued";
  }
  return touch(invoice, { amountPaidMinor: newPaid, status });
}

/** Whether the invoice is fully paid. */
export const isInvoiceSettled = (invoice: Invoice): boolean => invoice.status === "paid";
