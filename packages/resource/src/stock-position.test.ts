import { describe, expect, it } from "vitest";
import type { StockMemberView, StockMovementView } from "./resource-view";
import { computeStockPosition, summarizeStock } from "./stock-position";

describe("computeStockPosition", () => {
  it("reconciles receipts, issues and signed adjustments into on-hand", () => {
    const movements: StockMovementView[] = [
      { type: "receipt", quantity: 100 },
      { type: "receipt", quantity: 50 },
      { type: "issue", quantity: 30 },
      { type: "adjustment", quantity: -5 }, // shrinkage
    ];
    const pos = computeStockPosition("item-1", 20, movements);
    expect(pos.receivedQuantity).toBe(150);
    expect(pos.issuedQuantity).toBe(30);
    expect(pos.adjustmentQuantity).toBe(-5);
    expect(pos.onHandQuantity).toBe(115); // 150 - 30 - 5
    expect(pos.belowReorder).toBe(false);
    expect(pos.movementCount).toBe(4);
  });

  it("flags stock at or below the reorder level (out of stock included)", () => {
    const atLevel = computeStockPosition("i", 20, [{ type: "receipt", quantity: 20 }]);
    expect(atLevel.belowReorder).toBe(true); // 20 <= 20

    const below = computeStockPosition("i", 20, [
      { type: "receipt", quantity: 25 },
      { type: "issue", quantity: 10 },
    ]);
    expect(below.onHandQuantity).toBe(15);
    expect(below.belowReorder).toBe(true);

    const empty = computeStockPosition("i", 0, []);
    expect(empty.onHandQuantity).toBe(0);
    expect(empty.belowReorder).toBe(true); // 0 <= 0
  });
});

describe("summarizeStock", () => {
  it("rolls up item count, total on hand and below-reorder count", () => {
    const members: StockMemberView[] = [
      { onHandQuantity: 115, belowReorder: false },
      { onHandQuantity: 5, belowReorder: true },
      { onHandQuantity: 0, belowReorder: true },
    ];
    const summary = summarizeStock(members);
    expect(summary.itemCount).toBe(3);
    expect(summary.totalOnHandQuantity).toBe(120);
    expect(summary.belowReorderCount).toBe(2);
  });
});
