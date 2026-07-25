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

// --- Directories -----------------------------------------------------------------

/**
 * The organization (campus / institution node, P2-D01-M01) a resource record attaches to does not
 * exist in the tenant. Suppliers, items, orders and assets belong to an organization; the domain links
 * to it, never duplicates it.
 */
export class OrganizationNotFoundForResourceError extends PlatformError {
  constructor(organizationId: string) {
    super(`Organization "${organizationId}" not found; cannot attach the resource record to it`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { organizationId },
    });
  }
}

/** A money amount (a standard cost, unit price or asset value) must be zero or positive. */
export class NegativeAmountError extends PlatformError {
  constructor(amountMinor: number) {
    super(`A money amount must be zero or positive, received ${amountMinor}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { amountMinor },
    });
  }
}

// --- Supplier --------------------------------------------------------------------

/** The requested supplier does not exist in the current tenant. */
export class SupplierNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Supplier "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A supplier must carry a non-empty code. */
export class EmptySupplierCodeError extends PlatformError {
  constructor() {
    super("A supplier must have a non-empty code", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A supplier must carry a non-empty name. */
export class EmptySupplierNameError extends PlatformError {
  constructor() {
    super("A supplier must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The supplier code is already in use within the tenant. */
export class DuplicateSupplierCodeError extends PlatformError {
  constructor(code: string) {
    super(`Supplier code "${code}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** The requested supplier lifecycle transition is not permitted. */
export class InvalidSupplierTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition supplier from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Inventory item --------------------------------------------------------------

/** The requested inventory item does not exist in the current tenant. */
export class InventoryItemNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Inventory item "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An inventory item must carry a non-empty SKU. */
export class EmptySkuError extends PlatformError {
  constructor() {
    super("An inventory item must have a non-empty SKU", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** An inventory item must carry a non-empty name. */
export class EmptyItemNameError extends PlatformError {
  constructor() {
    super("An inventory item must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** An inventory item must carry a non-empty unit of measure. */
export class EmptyUnitOfMeasureError extends PlatformError {
  constructor() {
    super("An inventory item must have a non-empty unit of measure", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The inventory-item SKU is already in use within the tenant. */
export class DuplicateSkuError extends PlatformError {
  constructor(sku: string) {
    super(`Inventory item SKU "${sku}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { sku },
    });
  }
}

/** The requested inventory-item lifecycle transition is not permitted. */
export class InvalidItemTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition inventory item from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}
