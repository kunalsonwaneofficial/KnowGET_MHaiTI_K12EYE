import type {
  StockMemberView,
  StockMovementView,
  StockPosition,
  StockSummary,
} from "./resource-view";

/**
 * The pure stock-balance engine — reconciles an item's movements into its on-hand quantity: receipts
 * add, issues remove, and adjustments apply a signed delta. It reports the component totals, the
 * on-hand quantity (received − issued + adjustments) and whether on hand has reached the reorder level
 * (`onHand ≤ reorderLevel`, i.e. time to reorder). Pure, deterministic and integer — the genuine read
 * model of stock on hand. Built and tested before any aggregate depends on it.
 */
export function computeStockPosition(
  itemId: string,
  reorderLevel: number,
  movements: readonly StockMovementView[],
): StockPosition {
  let receivedQuantity = 0;
  let issuedQuantity = 0;
  let adjustmentQuantity = 0;
  for (const movement of movements) {
    if (movement.type === "receipt") {
      receivedQuantity += movement.quantity;
    } else if (movement.type === "issue") {
      issuedQuantity += movement.quantity;
    } else {
      adjustmentQuantity += movement.quantity;
    }
  }
  const onHandQuantity = receivedQuantity - issuedQuantity + adjustmentQuantity;
  return {
    itemId,
    onHandQuantity,
    receivedQuantity,
    issuedQuantity,
    adjustmentQuantity,
    reorderLevel,
    belowReorder: onHandQuantity <= reorderLevel,
    movementCount: movements.length,
  };
}

/**
 * The pure stock-rollup engine — summarizes a set of item positions into a leadership picture: item
 * count, total units on hand, and the count of items at or below their reorder level. Pure and
 * deterministic.
 */
export function summarizeStock(members: readonly StockMemberView[]): StockSummary {
  let totalOnHandQuantity = 0;
  let belowReorderCount = 0;
  for (const member of members) {
    totalOnHandQuantity += member.onHandQuantity;
    if (member.belowReorder) {
      belowReorderCount += 1;
    }
  }
  return {
    itemCount: members.length,
    totalOnHandQuantity,
    belowReorderCount,
  };
}
