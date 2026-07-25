import type { MovementType } from "./resource-value";

/**
 * The narrow views the pure engines consume. The aggregates structurally satisfy them, so the engines
 * depend on no aggregate — the same pure-engine-over-views pattern used across P2-D07…D14.
 */

/**
 * The minimal view of a stock movement the stock-balance engine needs. For a `receipt`/`issue` the
 * quantity is a positive magnitude (the engine applies the sign by type); for an `adjustment` it is a
 * signed delta (negative for shrinkage/write-off).
 */
export interface StockMovementView {
  readonly type: MovementType;
  readonly quantity: number;
}

/**
 * An item's stock position — the on-hand quantity reconciled from its movements (received − issued +
 * signed adjustments), the component totals, and whether it has reached its reorder level. Descriptive
 * and exact; the genuine read model of stock on hand.
 */
export interface StockPosition {
  readonly itemId: string;
  readonly onHandQuantity: number;
  readonly receivedQuantity: number;
  readonly issuedQuantity: number;
  readonly adjustmentQuantity: number;
  readonly reorderLevel: number;
  readonly belowReorder: boolean;
  readonly movementCount: number;
}

/** The minimal view of an item's stock position the organization rollup needs. */
export interface StockMemberView {
  readonly onHandQuantity: number;
  readonly belowReorder: boolean;
}

/**
 * A leadership-facing rollup of an organization's stock — item count, total units on hand, and the
 * count of items at or below their reorder level. Descriptive only.
 */
export interface StockSummary {
  readonly itemCount: number;
  readonly totalOnHandQuantity: number;
  readonly belowReorderCount: number;
}

/** The minimal view of an asset the depreciation engine needs (cost, salvage, life, currency). */
export interface AssetDepreciationView {
  readonly acquisitionCostMinor: number;
  readonly salvageValueMinor: number;
  readonly usefulLifeMonths: number;
  readonly currency: string;
}

/**
 * A straight-line depreciation result as of a number of months elapsed — the accumulated depreciation
 * and the net book value (cost − accumulated), in minor units, plus whether the asset is fully
 * depreciated. Pure and exact: accumulated reaches exactly the depreciable base at end of life, so net
 * book value lands exactly on the salvage value.
 */
export interface DepreciationResult {
  readonly currency: string;
  readonly acquisitionCostMinor: number;
  readonly salvageValueMinor: number;
  readonly accumulatedDepreciationMinor: number;
  readonly netBookValueMinor: number;
  readonly monthsElapsed: number;
  readonly usefulLifeMonths: number;
  readonly fullyDepreciated: boolean;
}
