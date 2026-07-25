import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateOrderLineKeyError,
  EmptyOrderError,
  EmptyOrderNumberError,
  InvalidCurrencyError,
  InvalidOrderTransitionError,
  OrderHasReceiptsError,
  OrderLineNotFoundError,
  OrderNotEditableError,
} from "./errors";
import { isCurrencyCode, type Money, money } from "./money";
import {
  isOrderLineFullyReceived,
  makeOrderLine,
  type OrderLine,
  type OrderLineInput,
  receiveOnLine,
} from "./order-line";
import { isReceivablePurchaseOrder, type PurchaseOrderStatus } from "./resource-value";

/**
 * A purchase order — an order to a supplier for a set of {@link OrderLine}s in one currency. It runs
 * `draft → issued`, then `partially_received` / `received` as goods arrive, `closed` when settled, or
 * `cancelled`. Lines are editable **only while draft** and frozen once issued; receiving raises each
 * line's `receivedQuantity` (never past what was ordered) and recomputes the status. `requisitionId`
 * records the approved requisition it was raised from, if any.
 */
export interface PurchaseOrder {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly supplierId: Uuid;
  readonly number: string;
  readonly currency: string;
  readonly requisitionId: Uuid | null;
  readonly expectedDate: string | null;
  readonly lines: readonly OrderLine[];
  readonly status: PurchaseOrderStatus;
  readonly issuedAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface DraftPurchaseOrderParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly supplierId: Uuid;
  readonly number: string;
  readonly currency: string;
  readonly requisitionId?: Uuid | null;
  readonly expectedDate?: string | null;
  readonly lines?: readonly OrderLineInput[];
}

/** Build the line list, rejecting duplicate keys. */
function buildLines(inputs: readonly OrderLineInput[]): OrderLine[] {
  const seen = new Set<string>();
  const lines: OrderLine[] = [];
  for (const input of inputs) {
    const line = makeOrderLine(input);
    if (seen.has(line.key)) {
      throw new DuplicateOrderLineKeyError(line.key);
    }
    seen.add(line.key);
    lines.push(line);
  }
  return lines;
}

/** Draft a purchase order (status `draft`). Number and a valid currency required. */
export function draftPurchaseOrder(params: DraftPurchaseOrderParams): PurchaseOrder {
  const number = params.number.trim();
  if (number.length === 0) {
    throw new EmptyOrderNumberError();
  }
  if (!isCurrencyCode(params.currency)) {
    throw new InvalidCurrencyError(params.currency);
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    supplierId: params.supplierId,
    number,
    currency: params.currency,
    requisitionId: params.requisitionId ?? null,
    expectedDate: params.expectedDate ?? null,
    lines: buildLines(params.lines ?? []),
    status: "draft",
    issuedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (order: PurchaseOrder, patch: Partial<PurchaseOrder>): PurchaseOrder => ({
  ...order,
  ...patch,
  updatedAt: nowIso(),
});

const requireDraft = (order: PurchaseOrder): void => {
  if (order.status !== "draft") {
    throw new OrderNotEditableError(order.id, order.status);
  }
};

/** The order total (sum of line totals) in minor units. */
export function purchaseOrderTotalMinor(order: PurchaseOrder): number {
  return order.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0);
}

/** The order total as {@link Money}. */
export const purchaseOrderTotal = (order: PurchaseOrder): Money =>
  money(purchaseOrderTotalMinor(order), order.currency);

/** Add a line to a draft order (unique key). */
export function addOrderLine(order: PurchaseOrder, input: OrderLineInput): PurchaseOrder {
  requireDraft(order);
  const line = makeOrderLine(input);
  if (order.lines.some((l) => l.key === line.key)) {
    throw new DuplicateOrderLineKeyError(line.key);
  }
  return touch(order, { lines: [...order.lines, line] });
}

/** Remove a line from a draft order. */
export function removeOrderLine(order: PurchaseOrder, key: string): PurchaseOrder {
  requireDraft(order);
  if (!order.lines.some((l) => l.key === key)) {
    throw new OrderLineNotFoundError(key);
  }
  return touch(order, { lines: order.lines.filter((l) => l.key !== key) });
}

/** Issue a draft order (→ `issued`), freezing its lines. Requires at least one line. */
export function issuePurchaseOrder(order: PurchaseOrder): PurchaseOrder {
  if (order.status !== "draft") {
    throw new InvalidOrderTransitionError(order.status, "issued");
  }
  if (order.lines.length === 0) {
    throw new EmptyOrderError();
  }
  return touch(order, { status: "issued", issuedAt: nowIso() });
}

/**
 * Receive `quantity` against a line — raises that line's `receivedQuantity` (rejecting over-receipt)
 * and recomputes the order status (`received` when every line is fully received, else
 * `partially_received`). The order must still be receivable.
 */
export function receivePurchaseOrderLine(
  order: PurchaseOrder,
  key: string,
  quantity: number,
): PurchaseOrder {
  if (!isReceivablePurchaseOrder(order.status)) {
    throw new InvalidOrderTransitionError(order.status, "partially_received");
  }
  if (!order.lines.some((l) => l.key === key)) {
    throw new OrderLineNotFoundError(key);
  }
  const lines = order.lines.map((l) => (l.key === key ? receiveOnLine(l, quantity) : l));
  const status: PurchaseOrderStatus = lines.every(isOrderLineFullyReceived)
    ? "received"
    : "partially_received";
  return touch(order, { lines, status });
}

/** Close a received (or partially-received, short-closed) order (→ `closed`). */
export function closePurchaseOrder(order: PurchaseOrder): PurchaseOrder {
  if (order.status !== "received" && order.status !== "partially_received") {
    throw new InvalidOrderTransitionError(order.status, "closed");
  }
  return touch(order, { status: "closed" });
}

/**
 * Cancel an order that has not yet received goods (→ `cancelled`). A `received`, `closed` or already
 * `cancelled` order cannot be cancelled; a `partially_received` order has receipts and must be closed
 * instead.
 */
export function cancelPurchaseOrder(order: PurchaseOrder): PurchaseOrder {
  if (order.status === "received" || order.status === "closed" || order.status === "cancelled") {
    throw new InvalidOrderTransitionError(order.status, "cancelled");
  }
  if (order.lines.some((l) => l.receivedQuantity > 0)) {
    throw new OrderHasReceiptsError(order.id);
  }
  return touch(order, { status: "cancelled" });
}

/** Whether every line has been fully received. */
export const isPurchaseOrderFullyReceived = (order: PurchaseOrder): boolean =>
  order.lines.length > 0 && order.lines.every(isOrderLineFullyReceived);
