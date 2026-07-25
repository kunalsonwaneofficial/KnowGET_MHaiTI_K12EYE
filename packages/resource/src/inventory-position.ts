import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { StockMemberView, StockPosition } from "./resource-view";

/**
 * An inventory position — the descriptive read model of an item's stock, kept in step with the item's
 * movements by the pure stock-balance engine. It carries the reconciled on-hand quantity and its
 * components, whether the item is at or below its reorder level, and (when the item has a standard
 * cost) the stock value on hand. It is never a transaction: it is refreshed (bumping `version`)
 * whenever the item's movements change. Exactly one position per item.
 */
export interface InventoryPosition {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly itemId: Uuid;
  readonly sku: string;
  readonly onHandQuantity: number;
  readonly receivedQuantity: number;
  readonly issuedQuantity: number;
  readonly adjustmentQuantity: number;
  readonly reorderLevel: number;
  readonly belowReorder: boolean;
  readonly stockValueMinor: number | null;
  readonly currency: string | null;
  readonly version: number;
  readonly refreshedAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateInventoryPositionParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly itemId: Uuid;
  readonly sku: string;
  readonly position: StockPosition;
  readonly stockValueMinor: number | null;
  readonly currency: string | null;
}

type PositionFields = Pick<
  InventoryPosition,
  | "onHandQuantity"
  | "receivedQuantity"
  | "issuedQuantity"
  | "adjustmentQuantity"
  | "reorderLevel"
  | "belowReorder"
>;

const fieldsOf = (position: StockPosition): PositionFields => ({
  onHandQuantity: position.onHandQuantity,
  receivedQuantity: position.receivedQuantity,
  issuedQuantity: position.issuedQuantity,
  adjustmentQuantity: position.adjustmentQuantity,
  reorderLevel: position.reorderLevel,
  belowReorder: position.belowReorder,
});

/** Create an inventory position from a first stock reconciliation (version 1). */
export function createInventoryPosition(params: CreateInventoryPositionParams): InventoryPosition {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    itemId: params.itemId,
    sku: params.sku,
    ...fieldsOf(params.position),
    stockValueMinor: params.stockValueMinor,
    currency: params.currency,
    version: 1,
    refreshedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

/** Refresh a position from a fresh reconciliation, bumping the version. */
export function refreshInventoryPosition(
  existing: InventoryPosition,
  sku: string,
  position: StockPosition,
  stockValueMinor: number | null,
  currency: string | null,
): InventoryPosition {
  const now = nowIso();
  return {
    ...existing,
    sku,
    ...fieldsOf(position),
    stockValueMinor,
    currency,
    version: existing.version + 1,
    refreshedAt: now,
    updatedAt: now,
  };
}

/** The rollup member view of the position (for the stock-summary engine). */
export const positionMemberView = (position: InventoryPosition): StockMemberView => ({
  onHandQuantity: position.onHandQuantity,
  belowReorder: position.belowReorder,
});
