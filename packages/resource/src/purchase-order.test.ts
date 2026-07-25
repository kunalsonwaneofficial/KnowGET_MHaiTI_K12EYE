import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  EmptyOrderError,
  InvalidOrderTransitionError,
  OrderHasReceiptsError,
  OrderLineNotFoundError,
  OrderNotEditableError,
  OverReceiptError,
} from "./errors";
import {
  addOrderLine,
  cancelPurchaseOrder,
  closePurchaseOrder,
  draftPurchaseOrder,
  isPurchaseOrderFullyReceived,
  issuePurchaseOrder,
  purchaseOrderTotal,
  receivePurchaseOrderLine,
} from "./purchase-order";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const SUP = "55555555-5555-5555-5555-555555555555" as Uuid;
const ITEM = "33333333-3333-3333-3333-333333333333" as Uuid;

const base = {
  tenantId: TENANT,
  organizationId: ORG,
  supplierId: SUP,
  number: "PO-001",
  currency: "INR",
  lines: [
    { key: "pens", itemId: ITEM, description: "Blue pens", quantity: 10, unitPriceMinor: 5000 },
    { key: "paper", description: "A4 paper", quantity: 5, unitPriceMinor: 20000 },
  ],
} as const;
const draft = () => draftPurchaseOrder(base);
const issued = () => issuePurchaseOrder(draft());

describe("purchase order", () => {
  it("drafts, totals its lines, and issues (freezing them)", () => {
    const o = draft();
    expect(o.status).toBe("draft");
    expect(purchaseOrderTotal(o)).toEqual({ amountMinor: 150000, currency: "INR" }); // 50000 + 100000
    const iss = issuePurchaseOrder(o);
    expect(iss.status).toBe("issued");
    expect(() =>
      addOrderLine(iss, { key: "x", description: "X", quantity: 1, unitPriceMinor: 1 }),
    ).toThrow(OrderNotEditableError);
    expect(() => issuePurchaseOrder(draftPurchaseOrder({ ...base, lines: [] }))).toThrow(
      EmptyOrderError,
    );
  });

  it("receives partially then fully, rejecting over-receipt and unknown lines", () => {
    let o = receivePurchaseOrderLine(issued(), "pens", 10);
    expect(o.status).toBe("partially_received"); // paper still outstanding
    o = receivePurchaseOrderLine(o, "paper", 5);
    expect(o.status).toBe("received");
    expect(isPurchaseOrderFullyReceived(o)).toBe(true);
    expect(() => receivePurchaseOrderLine(issued(), "pens", 11)).toThrow(OverReceiptError);
    expect(() => receivePurchaseOrderLine(issued(), "missing", 1)).toThrow(OrderLineNotFoundError);
  });

  it("closes a received order and cancels only when no goods received", () => {
    const received = receivePurchaseOrderLine(
      receivePurchaseOrderLine(issued(), "pens", 10),
      "paper",
      5,
    );
    expect(closePurchaseOrder(received).status).toBe("closed");
    expect(cancelPurchaseOrder(draft()).status).toBe("cancelled");
    expect(cancelPurchaseOrder(issued()).status).toBe("cancelled");
    expect(() => cancelPurchaseOrder(receivePurchaseOrderLine(issued(), "pens", 5))).toThrow(
      OrderHasReceiptsError,
    );
    expect(() => cancelPurchaseOrder(received)).toThrow(InvalidOrderTransitionError);
  });
});
