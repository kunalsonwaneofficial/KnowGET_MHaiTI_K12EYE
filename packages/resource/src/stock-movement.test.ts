import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { InvalidStockMovementError } from "./errors";
import { recordStockMovement } from "./stock-movement";

const base = {
  tenantId: "11111111-1111-1111-1111-111111111111" as TenantId,
  organizationId: "22222222-2222-2222-2222-222222222222" as Uuid,
  itemId: "33333333-3333-3333-3333-333333333333" as Uuid,
  occurredAt: "2025-05-01",
} as const;

describe("recordStockMovement", () => {
  it("records receipts, issues (positive) and signed adjustments", () => {
    expect(recordStockMovement({ ...base, type: "receipt", quantity: 100 }).quantity).toBe(100);
    expect(recordStockMovement({ ...base, type: "issue", quantity: 30 }).quantity).toBe(30);
    expect(recordStockMovement({ ...base, type: "adjustment", quantity: -5 }).quantity).toBe(-5);
  });

  it("rejects a non-positive receipt/issue, a zero adjustment, and non-integers", () => {
    expect(() => recordStockMovement({ ...base, type: "receipt", quantity: 0 })).toThrow(
      InvalidStockMovementError,
    );
    expect(() => recordStockMovement({ ...base, type: "issue", quantity: -1 })).toThrow(
      InvalidStockMovementError,
    );
    expect(() => recordStockMovement({ ...base, type: "adjustment", quantity: 0 })).toThrow(
      InvalidStockMovementError,
    );
    expect(() => recordStockMovement({ ...base, type: "receipt", quantity: 1.5 })).toThrow(
      InvalidStockMovementError,
    );
  });
});
