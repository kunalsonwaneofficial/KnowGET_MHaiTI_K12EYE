import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  createInventoryPosition,
  positionMemberView,
  refreshInventoryPosition,
} from "./inventory-position";
import type { StockPosition } from "./resource-view";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const ITEM = "33333333-3333-3333-3333-333333333333" as Uuid;

const stockPos = (over: Partial<StockPosition> = {}): StockPosition => ({
  itemId: ITEM,
  onHandQuantity: 70,
  receivedQuantity: 100,
  issuedQuantity: 30,
  adjustmentQuantity: 0,
  reorderLevel: 20,
  belowReorder: false,
  movementCount: 2,
  ...over,
});

const create = () =>
  createInventoryPosition({
    tenantId: TENANT,
    organizationId: ORG,
    itemId: ITEM,
    sku: "PEN-BLUE",
    position: stockPos(),
    stockValueMinor: 350000,
    currency: "INR",
  });

describe("inventory position", () => {
  it("creates from a reconciliation and refreshes, bumping the version and keeping identity", () => {
    const p = create();
    expect(p.version).toBe(1);
    expect(p.onHandQuantity).toBe(70);
    expect(p.stockValueMinor).toBe(350000);
    expect(p.belowReorder).toBe(false);
    expect(p.refreshedAt).not.toBeNull();

    const refreshed = refreshInventoryPosition(
      p,
      "PEN-BLUE",
      stockPos({ onHandQuantity: 10, issuedQuantity: 90, belowReorder: true }),
      50000,
      "INR",
    );
    expect(refreshed.id).toBe(p.id);
    expect(refreshed.version).toBe(2);
    expect(refreshed.onHandQuantity).toBe(10);
    expect(refreshed.belowReorder).toBe(true);
  });

  it("exposes a member view for the stock rollup", () => {
    const p = createInventoryPosition({
      tenantId: TENANT,
      organizationId: ORG,
      itemId: ITEM,
      sku: "PEN-BLUE",
      position: stockPos({ belowReorder: true }),
      stockValueMinor: null,
      currency: null,
    });
    expect(positionMemberView(p)).toEqual({ onHandQuantity: 70, belowReorder: true });
  });
});
