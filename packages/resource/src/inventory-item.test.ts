import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  EmptyItemNameError,
  EmptySkuError,
  EmptyUnitOfMeasureError,
  InvalidCurrencyError,
  InvalidItemTransitionError,
  InvalidQuantityError,
  NegativeAmountError,
} from "./errors";
import {
  createInventoryItem,
  discontinueItem,
  isItemActive,
  reactivateItem,
  setItemStandardCost,
  setReorderLevel,
} from "./inventory-item";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;

const base = {
  tenantId: TENANT,
  organizationId: ORG,
  sku: "PEN-BLUE",
  name: "Blue Pen",
  unitOfMeasure: "box",
  reorderLevel: 10,
} as const;
const create = () => createInventoryItem(base);

describe("inventory item", () => {
  it("creates active with a reorder level and an optional standard cost", () => {
    const i = create();
    expect(i.status).toBe("active");
    expect(isItemActive(i)).toBe(true);
    expect(i.reorderLevel).toBe(10);
    expect(i.standardCostMinor).toBeNull();

    const withCost = createInventoryItem({ ...base, standardCostMinor: 5000, currency: "INR" });
    expect(withCost.standardCostMinor).toBe(5000);
    expect(withCost.currency).toBe("INR");
  });

  it("validates sku, name, unit of measure, reorder level and standard cost", () => {
    expect(() => createInventoryItem({ ...base, sku: " " })).toThrow(EmptySkuError);
    expect(() => createInventoryItem({ ...base, name: " " })).toThrow(EmptyItemNameError);
    expect(() => createInventoryItem({ ...base, unitOfMeasure: " " })).toThrow(
      EmptyUnitOfMeasureError,
    );
    expect(() => createInventoryItem({ ...base, reorderLevel: -1 })).toThrow(InvalidQuantityError);
    expect(() => createInventoryItem({ ...base, reorderLevel: 1.5 })).toThrow(InvalidQuantityError);
    expect(() =>
      createInventoryItem({ ...base, standardCostMinor: 5000, currency: "rupee" }),
    ).toThrow(InvalidCurrencyError);
    expect(() => createInventoryItem({ ...base, standardCostMinor: -1, currency: "INR" })).toThrow(
      NegativeAmountError,
    );
  });

  it("edits and runs active ↔ discontinued", () => {
    let i = setReorderLevel(create(), 25);
    expect(i.reorderLevel).toBe(25);
    i = setItemStandardCost(i, 6000, "INR");
    expect(i.standardCostMinor).toBe(6000);
    i = setItemStandardCost(i, null, null);
    expect(i.standardCostMinor).toBeNull();
    expect(i.currency).toBeNull();

    const disc = discontinueItem(create());
    expect(disc.status).toBe("discontinued");
    expect(reactivateItem(disc).status).toBe("active");
    expect(() => reactivateItem(create())).toThrow(InvalidItemTransitionError);
  });
});
