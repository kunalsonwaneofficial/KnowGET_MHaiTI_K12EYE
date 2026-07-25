/** Lifecycle of a supplier (vendor) — active, temporarily suspended, or permanently blacklisted. */
export const SUPPLIER_STATUSES = ["active", "suspended", "blacklisted"] as const;

export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

/** Lifecycle of an inventory item — active (stockable/orderable) or discontinued. */
export const ITEM_STATUSES = ["active", "discontinued"] as const;

export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** Lifecycle of a purchase requisition (an internal request to buy). */
export const REQUISITION_STATUSES = ["draft", "submitted", "approved", "rejected"] as const;

export type RequisitionStatus = (typeof REQUISITION_STATUSES)[number];

/**
 * Lifecycle of a purchase order to a supplier: `draft` → `issued`, then `partially_received` /
 * `received` as goods arrive, `closed` when settled, or `cancelled`. Lines are frozen once issued.
 */
export const PURCHASE_ORDER_STATUSES = [
  "draft",
  "issued",
  "partially_received",
  "received",
  "closed",
  "cancelled",
] as const;

export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

/** The purchase-order statuses that can still receive goods. */
export const RECEIVABLE_PO_STATUSES: readonly PurchaseOrderStatus[] = [
  "issued",
  "partially_received",
];

/** Whether a purchase order can still receive goods. */
export const isReceivablePurchaseOrder = (status: PurchaseOrderStatus): boolean =>
  RECEIVABLE_PO_STATUSES.includes(status);

/**
 * The kind of stock movement: a `receipt` adds stock (goods in), an `issue` removes it (goods out to a
 * department), an `adjustment` corrects it by a signed delta (stocktake, shrinkage, write-off).
 */
export const MOVEMENT_TYPES = ["receipt", "issue", "adjustment"] as const;

export type MovementType = (typeof MOVEMENT_TYPES)[number];

/** Lifecycle of a fixed asset — in service, under maintenance, retired, or disposed. */
export const ASSET_STATUSES = ["in_service", "under_maintenance", "retired", "disposed"] as const;

export type AssetStatus = (typeof ASSET_STATUSES)[number];

/** Lifecycle of an asset-maintenance record. */
export const MAINTENANCE_STATUSES = ["scheduled", "completed", "cancelled"] as const;

export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];
