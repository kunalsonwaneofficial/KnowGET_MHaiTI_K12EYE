import { PlatformError } from "@knowget/exceptions";

/** A money amount must be a whole number of minor units (no fractional cents/paise). */
export class InvalidMoneyError extends PlatformError {
  constructor(amountMinor: number) {
    super(`A money amount must be an integer number of minor units, received ${amountMinor}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { amountMinor },
    });
  }
}

/** A currency must be a 3-letter ISO 4217 code (e.g. "INR", "USD"). */
export class InvalidCurrencyError extends PlatformError {
  constructor(currency: string) {
    super(`"${currency}" is not a valid ISO 4217 currency code`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { currency },
    });
  }
}

/** Two money amounts of different currencies cannot be combined. */
export class CurrencyMismatchError extends PlatformError {
  constructor(a: string, b: string) {
    super(`Cannot combine money of currency "${a}" with "${b}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { a, b },
    });
  }
}

/** An allocation requires a positive total weight and a non-negative amount. */
export class InvalidAllocationError extends PlatformError {
  constructor(reason: string) {
    super(`Cannot allocate money: ${reason}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { reason },
    });
  }
}

// --- Directories -----------------------------------------------------------------

/**
 * The organization (campus / institution node, P2-D01-M01) a financial record attaches to does not
 * exist in the tenant. Periods, fee structures, invoices and accounts belong to an organization; the
 * domain links to it, never duplicates it.
 */
export class OrganizationNotFoundForFinanceError extends PlatformError {
  constructor(organizationId: string) {
    super(`Organization "${organizationId}" not found; cannot attach the financial record to it`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { organizationId },
    });
  }
}

/** A fee component amount (and every persisted amount) must be zero or positive. */
export class NegativeAmountError extends PlatformError {
  constructor(amountMinor: number) {
    super(`A fee amount must be zero or positive, received ${amountMinor}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { amountMinor },
    });
  }
}

// --- Financial period ------------------------------------------------------------

/** The requested financial period does not exist in the current tenant. */
export class FinancialPeriodNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Financial period "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A financial period must carry a non-empty code. */
export class EmptyPeriodCodeError extends PlatformError {
  constructor() {
    super("A financial period must have a non-empty code", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A financial period must carry a non-empty label. */
export class EmptyPeriodLabelError extends PlatformError {
  constructor() {
    super("A financial period must have a non-empty label", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A financial period's end date must not precede its start date. */
export class InvalidPeriodRangeError extends PlatformError {
  constructor(startDate: string, endDate: string) {
    super(`Financial period end date "${endDate}" precedes start date "${startDate}"`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { startDate, endDate },
    });
  }
}

/** The financial-period code is already in use within the tenant. */
export class DuplicatePeriodCodeError extends PlatformError {
  constructor(code: string) {
    super(`Financial period code "${code}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** The requested financial-period lifecycle transition is not permitted. */
export class InvalidPeriodTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition financial period from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Fee structure ---------------------------------------------------------------

/** The requested fee structure does not exist in the current tenant. */
export class FeeStructureNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Fee structure "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A fee structure must carry a non-empty code. */
export class EmptyFeeStructureCodeError extends PlatformError {
  constructor() {
    super("A fee structure must have a non-empty code", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A fee structure must carry a non-empty name. */
export class EmptyFeeStructureNameError extends PlatformError {
  constructor() {
    super("A fee structure must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The fee-structure code is already in use within the tenant. */
export class DuplicateFeeStructureCodeError extends PlatformError {
  constructor(code: string) {
    super(`Fee structure code "${code}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** The requested fee-structure lifecycle transition is not permitted. */
export class InvalidFeeStructureTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition fee structure from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** Only a draft fee structure may have its components edited; once active they are frozen. */
export class FeeStructureNotEditableError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Fee structure "${id}" is "${status}"; its components can no longer be edited`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/** A fee component must carry a non-empty key. */
export class EmptyComponentKeyError extends PlatformError {
  constructor() {
    super("A fee component must have a non-empty key", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A fee component must carry a non-empty name. */
export class EmptyComponentNameError extends PlatformError {
  constructor() {
    super("A fee component must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The fee-component key is already used within the fee structure. */
export class DuplicateComponentKeyError extends PlatformError {
  constructor(key: string) {
    super(`Fee component key "${key}" is already used in this fee structure`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { key },
    });
  }
}

/** The referenced fee component is not part of the fee structure. */
export class ComponentNotFoundError extends PlatformError {
  constructor(key: string) {
    super(`Fee component "${key}" is not part of this fee structure`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { key },
    });
  }
}

/**
 * The student (P2-D03) an invoice or payment references does not exist in the tenant. A learner
 * billed here is a Student; the finance domain links to it and never duplicates it.
 */
export class StudentNotFoundForFinanceError extends PlatformError {
  constructor(studentId: string) {
    super(`Student "${studentId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { studentId },
    });
  }
}

// --- Invoice ---------------------------------------------------------------------

/** The requested invoice does not exist in the current tenant. */
export class InvoiceNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Invoice "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An invoice must carry a non-empty number. */
export class EmptyInvoiceNumberError extends PlatformError {
  constructor() {
    super("An invoice must have a non-empty number", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The invoice number is already in use within the tenant. */
export class DuplicateInvoiceNumberError extends PlatformError {
  constructor(number: string) {
    super(`Invoice number "${number}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { number },
    });
  }
}

/** An invoice line must carry a non-empty key. */
export class EmptyInvoiceLineKeyError extends PlatformError {
  constructor() {
    super("An invoice line must have a non-empty key", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** An invoice line must carry a non-empty description. */
export class EmptyInvoiceLineDescriptionError extends PlatformError {
  constructor() {
    super("An invoice line must have a non-empty description", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The invoice-line key is already used within the invoice. */
export class DuplicateInvoiceLineKeyError extends PlatformError {
  constructor(key: string) {
    super(`Invoice line key "${key}" is already used in this invoice`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { key },
    });
  }
}

/** The referenced invoice line is not part of the invoice. */
export class InvoiceLineNotFoundError extends PlatformError {
  constructor(key: string) {
    super(`Invoice line "${key}" is not part of this invoice`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { key },
    });
  }
}

/** Only a draft invoice may have its lines edited; once issued they are frozen. */
export class InvoiceNotEditableError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Invoice "${id}" is "${status}"; its lines can no longer be edited`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/** An invoice must have at least one line to be issued. */
export class EmptyInvoiceError extends PlatformError {
  constructor() {
    super("An invoice must have at least one line to be issued", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The requested invoice lifecycle transition is not permitted. */
export class InvalidInvoiceTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition invoice from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** The invoice is not in a state that can accept (or reverse) a payment. */
export class InvoiceNotPayableError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Invoice "${id}" is "${status}"; it cannot accept or reverse a payment`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/** A payment would take the invoice's paid amount past its total. */
export class PaymentExceedsOutstandingError extends PlatformError {
  constructor(invoiceId: string, outstandingMinor: number, amountMinor: number) {
    super(
      `Payment of ${amountMinor} exceeds invoice "${invoiceId}" outstanding balance ${outstandingMinor}`,
      {
        code: "CONFLICT",
        httpStatus: 409,
        isOperational: true,
        details: { invoiceId, outstandingMinor, amountMinor },
      },
    );
  }
}

/** A reversal would take the invoice's paid amount below zero. */
export class ReversalExceedsPaidError extends PlatformError {
  constructor(invoiceId: string, paidMinor: number, amountMinor: number) {
    super(`Reversal of ${amountMinor} exceeds invoice "${invoiceId}" paid amount ${paidMinor}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { invoiceId, paidMinor, amountMinor },
    });
  }
}

/** An invoice with recorded payments cannot be cancelled; refund the payments first. */
export class InvoiceHasPaymentsError extends PlatformError {
  constructor(id: string) {
    super(`Invoice "${id}" has payments applied and cannot be cancelled; refund them first`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Payment ---------------------------------------------------------------------

/** The requested payment does not exist in the current tenant. */
export class PaymentNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Payment "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A payment amount must be a positive whole number of minor units. */
export class InvalidPaymentAmountError extends PlatformError {
  constructor(amountMinor: number) {
    super(
      `A payment amount must be a positive integer number of minor units, received ${amountMinor}`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { amountMinor },
      },
    );
  }
}

/** The requested payment lifecycle transition is not permitted. */
export class InvalidPaymentTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition payment from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}
