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

/**
 * The employee (P2-D12) a resource record references does not exist in the tenant. A requester,
 * custodian or approver is an Employee; the domain links to it and never duplicates it.
 */
export class EmployeeNotFoundForResourceError extends PlatformError {
  constructor(employeeId: string) {
    super(`Employee "${employeeId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { employeeId },
    });
  }
}

// --- Stock movement --------------------------------------------------------------

/** The requested stock movement does not exist in the current tenant. */
export class StockMovementNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Stock movement "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A stock movement is malformed (bad quantity for its type). */
export class InvalidStockMovementError extends PlatformError {
  constructor(reason: string) {
    super(`Invalid stock movement: ${reason}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { reason },
    });
  }
}

/** An issue cannot draw more stock than is on hand. */
export class InsufficientStockError extends PlatformError {
  constructor(itemId: string, requested: number, available: number) {
    super(`Cannot issue ${requested} of item "${itemId}"; only ${available} on hand`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { itemId, requested, available },
    });
  }
}

// --- Purchase requisition --------------------------------------------------------

/** The requested purchase requisition does not exist in the current tenant. */
export class PurchaseRequisitionNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Purchase requisition "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A purchase requisition must carry a non-empty title. */
export class EmptyRequisitionTitleError extends PlatformError {
  constructor() {
    super("A purchase requisition must have a non-empty title", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** Only a draft requisition may have its lines edited; once submitted they are frozen. */
export class RequisitionNotEditableError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Purchase requisition "${id}" is "${status}"; its lines can no longer be edited`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/** A purchase requisition must have at least one line to be submitted. */
export class EmptyRequisitionError extends PlatformError {
  constructor() {
    super("A purchase requisition must have at least one line to be submitted", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The requested purchase-requisition lifecycle transition is not permitted. */
export class InvalidRequisitionTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition purchase requisition from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** A requisition line must carry a non-empty key. */
export class EmptyRequisitionLineKeyError extends PlatformError {
  constructor() {
    super("A requisition line must have a non-empty key", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A requisition line must carry a non-empty description. */
export class EmptyRequisitionLineDescriptionError extends PlatformError {
  constructor() {
    super("A requisition line must have a non-empty description", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The requisition-line key is already used within the requisition. */
export class DuplicateRequisitionLineKeyError extends PlatformError {
  constructor(key: string) {
    super(`Requisition line key "${key}" is already used in this requisition`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { key },
    });
  }
}

/** The referenced requisition line is not part of the requisition. */
export class RequisitionLineNotFoundError extends PlatformError {
  constructor(key: string) {
    super(`Requisition line "${key}" is not part of this requisition`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { key },
    });
  }
}

// --- Purchase order --------------------------------------------------------------

/** The requested purchase order does not exist in the current tenant. */
export class PurchaseOrderNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Purchase order "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A purchase order must carry a non-empty number. */
export class EmptyOrderNumberError extends PlatformError {
  constructor() {
    super("A purchase order must have a non-empty number", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The purchase-order number is already in use within the tenant. */
export class DuplicateOrderNumberError extends PlatformError {
  constructor(number: string) {
    super(`Purchase order number "${number}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { number },
    });
  }
}

/** A purchase order must have at least one line to be issued. */
export class EmptyOrderError extends PlatformError {
  constructor() {
    super("A purchase order must have at least one line to be issued", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** Only a draft purchase order may have its lines edited; once issued they are frozen. */
export class OrderNotEditableError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Purchase order "${id}" is "${status}"; its lines can no longer be edited`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/** The requested purchase-order lifecycle transition is not permitted. */
export class InvalidOrderTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition purchase order from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** A purchase order with goods already received cannot be cancelled; close it instead. */
export class OrderHasReceiptsError extends PlatformError {
  constructor(id: string) {
    super(`Purchase order "${id}" has goods received and cannot be cancelled; close it instead`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/** A receipt would take a line's received quantity past the quantity ordered. */
export class OverReceiptError extends PlatformError {
  constructor(key: string, ordered: number, received: number, requested: number) {
    super(
      `Receiving ${requested} on line "${key}" exceeds the outstanding ${ordered - received} (ordered ${ordered}, received ${received})`,
      {
        code: "CONFLICT",
        httpStatus: 409,
        isOperational: true,
        details: { key, ordered, received, requested },
      },
    );
  }
}

/** An order line must carry a non-empty key. */
export class EmptyOrderLineKeyError extends PlatformError {
  constructor() {
    super("An order line must have a non-empty key", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** An order line must carry a non-empty description. */
export class EmptyOrderLineDescriptionError extends PlatformError {
  constructor() {
    super("An order line must have a non-empty description", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The order-line key is already used within the purchase order. */
export class DuplicateOrderLineKeyError extends PlatformError {
  constructor(key: string) {
    super(`Order line key "${key}" is already used in this purchase order`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { key },
    });
  }
}

/** The referenced order line is not part of the purchase order. */
export class OrderLineNotFoundError extends PlatformError {
  constructor(key: string) {
    super(`Order line "${key}" is not part of this purchase order`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { key },
    });
  }
}

/** A purchase order can only be issued to an active supplier. */
export class SupplierNotActiveError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Supplier "${id}" is "${status}"; a purchase order cannot be issued to it`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

// --- Asset -----------------------------------------------------------------------

/** The requested asset does not exist in the current tenant. */
export class AssetNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Asset "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An asset must carry a non-empty tag. */
export class EmptyAssetTagError extends PlatformError {
  constructor() {
    super("An asset must have a non-empty tag", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** An asset must carry a non-empty name. */
export class EmptyAssetNameError extends PlatformError {
  constructor() {
    super("An asset must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The asset tag is already in use within the tenant. */
export class DuplicateAssetTagError extends PlatformError {
  constructor(assetTag: string) {
    super(`Asset tag "${assetTag}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { assetTag },
    });
  }
}

/** An asset's valuation is invalid (salvage exceeds cost, or a non-positive useful life). */
export class InvalidAssetValuationError extends PlatformError {
  constructor(reason: string) {
    super(`Invalid asset valuation: ${reason}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { reason },
    });
  }
}

/** The requested asset lifecycle transition is not permitted. */
export class InvalidAssetTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition asset from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Asset maintenance -----------------------------------------------------------

/** The requested asset-maintenance record does not exist in the current tenant. */
export class AssetMaintenanceNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Asset maintenance record "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An asset-maintenance record must carry a non-empty description. */
export class EmptyMaintenanceDescriptionError extends PlatformError {
  constructor() {
    super("An asset-maintenance record must have a non-empty description", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The requested asset-maintenance lifecycle transition is not permitted. */
export class InvalidMaintenanceTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition asset maintenance from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Inventory position ----------------------------------------------------------

/** The requested inventory position does not exist in the current tenant. */
export class InventoryPositionNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Inventory position "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}
