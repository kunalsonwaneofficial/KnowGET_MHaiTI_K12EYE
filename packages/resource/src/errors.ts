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

/** A quantity must be a whole, non-negative number of units. */
export class InvalidQuantityError extends PlatformError {
  constructor(quantity: number) {
    super(`A quantity must be a non-negative integer, received ${quantity}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { quantity },
    });
  }
}

/** Straight-line depreciation requires a positive useful life and a salvage value within cost. */
export class InvalidDepreciationError extends PlatformError {
  constructor(reason: string) {
    super(`Cannot compute depreciation: ${reason}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { reason },
    });
  }
}
