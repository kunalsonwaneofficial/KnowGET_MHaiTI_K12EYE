import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { InvalidStockMovementError } from "./errors";
import type { MovementType } from "./resource-value";

/**
 * A stock movement — one immutable ledger entry against an inventory item: a `receipt` (goods in), an
 * `issue` (goods out) or an `adjustment` (a signed correction). It is never edited or deleted; a
 * mistake is corrected with a further adjustment, so the ledger is append-only and auditable. The
 * pure stock-balance engine reconciles an item's movements into its on-hand quantity.
 */
export interface StockMovement {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly itemId: Uuid;
  readonly type: MovementType;
  readonly quantity: number;
  readonly reason: string | null;
  readonly reference: string | null;
  readonly occurredAt: string;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RecordStockMovementParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly itemId: Uuid;
  readonly type: MovementType;
  readonly quantity: number;
  readonly occurredAt: string;
  readonly reason?: string | null;
  readonly reference?: string | null;
}

/**
 * Record a stock movement. A receipt or issue carries a **positive** quantity (the engine applies the
 * sign by type); an adjustment carries a **non-zero signed** quantity (negative for shrinkage). Once
 * recorded, a movement is immutable.
 */
export function recordStockMovement(params: RecordStockMovementParams): StockMovement {
  const quantity = params.quantity;
  if (!Number.isInteger(quantity)) {
    throw new InvalidStockMovementError("the quantity must be an integer");
  }
  if (params.type === "adjustment") {
    if (quantity === 0) {
      throw new InvalidStockMovementError("an adjustment must have a non-zero quantity");
    }
  } else if (quantity <= 0) {
    throw new InvalidStockMovementError("a receipt or issue must have a positive quantity");
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    itemId: params.itemId,
    type: params.type,
    quantity,
    reason: params.reason?.trim() || null,
    reference: params.reference?.trim() || null,
    occurredAt: params.occurredAt,
    createdAt: now,
    updatedAt: now,
  };
}
