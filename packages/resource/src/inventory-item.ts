import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyItemNameError,
  EmptySkuError,
  EmptyUnitOfMeasureError,
  InvalidCurrencyError,
  InvalidItemTransitionError,
  InvalidMoneyError,
  InvalidQuantityError,
  NegativeAmountError,
} from "./errors";
import { isCurrencyCode } from "./money";
import type { ItemStatus } from "./resource-value";

/**
 * An inventory item — a stockable good the institution holds (stationery, consumables, equipment). It
 * carries a unit of measure, a reorder level (the on-hand quantity at which it should be re-ordered),
 * and an optional standard cost used to value stock on hand. It runs `active → discontinued` (and
 * back). The `sku` is unique within the tenant; stock movements and order lines reference it.
 */
export interface InventoryItem {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly sku: string;
  readonly name: string;
  readonly category: string | null;
  readonly unitOfMeasure: string;
  readonly reorderLevel: number;
  readonly standardCostMinor: number | null;
  readonly currency: string | null;
  readonly status: ItemStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateInventoryItemParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly sku: string;
  readonly name: string;
  readonly unitOfMeasure: string;
  readonly reorderLevel: number;
  readonly category?: string | null;
  readonly standardCostMinor?: number | null;
  readonly currency?: string | null;
}

const requireReorderLevel = (reorderLevel: number): number => {
  if (!Number.isInteger(reorderLevel) || reorderLevel < 0) {
    throw new InvalidQuantityError(reorderLevel);
  }
  return reorderLevel;
};

/** Validate an optional standard cost: either both amount and currency, or neither. */
function normalizeStandardCost(
  amountMinor: number | null | undefined,
  currency: string | null | undefined,
): { standardCostMinor: number | null; currency: string | null } {
  if (amountMinor === null || amountMinor === undefined) {
    return { standardCostMinor: null, currency: null };
  }
  if (!Number.isInteger(amountMinor)) {
    throw new InvalidMoneyError(amountMinor);
  }
  if (amountMinor < 0) {
    throw new NegativeAmountError(amountMinor);
  }
  if (!currency || !isCurrencyCode(currency)) {
    throw new InvalidCurrencyError(currency ?? "");
  }
  return { standardCostMinor: amountMinor, currency };
}

/** Create an inventory item (status `active`). SKU, name and unit of measure required. */
export function createInventoryItem(params: CreateInventoryItemParams): InventoryItem {
  const sku = params.sku.trim();
  if (sku.length === 0) {
    throw new EmptySkuError();
  }
  const name = params.name.trim();
  if (name.length === 0) {
    throw new EmptyItemNameError();
  }
  const unitOfMeasure = params.unitOfMeasure.trim();
  if (unitOfMeasure.length === 0) {
    throw new EmptyUnitOfMeasureError();
  }
  const cost = normalizeStandardCost(params.standardCostMinor, params.currency);
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    sku,
    name,
    category: params.category?.trim() || null,
    unitOfMeasure,
    reorderLevel: requireReorderLevel(params.reorderLevel),
    standardCostMinor: cost.standardCostMinor,
    currency: cost.currency,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (item: InventoryItem, patch: Partial<InventoryItem>): InventoryItem => ({
  ...item,
  ...patch,
  updatedAt: nowIso(),
});

/** Rename an inventory item. */
export function renameInventoryItem(item: InventoryItem, name: string): InventoryItem {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new EmptyItemNameError();
  }
  return touch(item, { name: trimmed });
}

/** Set (or clear) the item's category. */
export const setItemCategory = (item: InventoryItem, category: string | null): InventoryItem =>
  touch(item, { category: category?.trim() || null });

/** Set the item's reorder level (non-negative integer). */
export function setReorderLevel(item: InventoryItem, reorderLevel: number): InventoryItem {
  return touch(item, { reorderLevel: requireReorderLevel(reorderLevel) });
}

/** Set (or clear) the item's standard cost (used to value stock on hand). */
export function setItemStandardCost(
  item: InventoryItem,
  amountMinor: number | null,
  currency: string | null,
): InventoryItem {
  return touch(item, normalizeStandardCost(amountMinor, currency));
}

/** Discontinue an active item (→ `discontinued`). */
export function discontinueItem(item: InventoryItem): InventoryItem {
  if (item.status !== "active") {
    throw new InvalidItemTransitionError(item.status, "discontinued");
  }
  return touch(item, { status: "discontinued" });
}

/** Reactivate a discontinued item (→ `active`). */
export function reactivateItem(item: InventoryItem): InventoryItem {
  if (item.status !== "discontinued") {
    throw new InvalidItemTransitionError(item.status, "active");
  }
  return touch(item, { status: "active" });
}

/** Whether the item is currently active (stockable/orderable). */
export const isItemActive = (item: InventoryItem): boolean => item.status === "active";
