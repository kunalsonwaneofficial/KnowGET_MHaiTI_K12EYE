import {
  EmptyInvoiceLineDescriptionError,
  EmptyInvoiceLineKeyError,
  InvalidMoneyError,
  NegativeAmountError,
} from "./errors";
import { type Money, money } from "./money";

/**
 * A single line on an {@link Invoice} — one charged item (a fee component made concrete, or an ad-hoc
 * charge). The `key` is a stable identifier unique within the invoice; `amountMinor` is a
 * non-negative whole number of minor units in the invoice's currency. Lines are frozen once the
 * invoice is issued, so the amount owed never shifts under a payment.
 */
export interface InvoiceLine {
  readonly key: string;
  readonly description: string;
  readonly amountMinor: number;
}

export interface InvoiceLineInput {
  readonly key: string;
  readonly description: string;
  readonly amountMinor: number;
}

/**
 * Normalize and validate an invoice-line input — trims text, requires a key and description, and
 * requires a non-negative integer amount (fractional minor units are rejected).
 */
export function makeInvoiceLine(input: InvoiceLineInput): InvoiceLine {
  const key = input.key.trim();
  if (key.length === 0) {
    throw new EmptyInvoiceLineKeyError();
  }
  const description = input.description.trim();
  if (description.length === 0) {
    throw new EmptyInvoiceLineDescriptionError();
  }
  if (!Number.isInteger(input.amountMinor)) {
    throw new InvalidMoneyError(input.amountMinor);
  }
  if (input.amountMinor < 0) {
    throw new NegativeAmountError(input.amountMinor);
  }
  return { key, description, amountMinor: input.amountMinor };
}

/** The line's amount as {@link Money} in the given (invoice) currency. */
export const invoiceLineMoney = (line: InvoiceLine, currency: string): Money =>
  money(line.amountMinor, currency);
