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
