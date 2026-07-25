import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { createInventoryItem } from "./inventory-item";
import { InventoryPositionService } from "./inventory-position-service";
import {
  InMemoryInventoryItemRepository,
  InMemoryInventoryPositionRepository,
  InMemoryStockMovementRepository,
} from "./ports";
import { recordStockMovement } from "./stock-movement";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;

describe("InventoryPositionService", () => {
  it("reconciles movements, values stock at standard cost, and rolls up the organization", async () => {
    const itemsRepo = new InMemoryInventoryItemRepository();
    const movementsRepo = new InMemoryStockMovementRepository();
    const positionsRepo = new InMemoryInventoryPositionRepository();

    const item = createInventoryItem({
      tenantId: TENANT,
      organizationId: ORG,
      sku: "PEN-BLUE",
      name: "Blue Pen",
      unitOfMeasure: "box",
      reorderLevel: 20,
      standardCostMinor: 5000,
      currency: "INR",
    });
    await itemsRepo.save(item);
    for (const m of [
      recordStockMovement({
        tenantId: TENANT,
        organizationId: ORG,
        itemId: item.id,
        type: "receipt",
        quantity: 100,
        occurredAt: "2025-05-01",
      }),
      recordStockMovement({
        tenantId: TENANT,
        organizationId: ORG,
        itemId: item.id,
        type: "issue",
        quantity: 30,
        occurredAt: "2025-05-02",
      }),
    ]) {
      await movementsRepo.save(m);
    }

    const svc = new InventoryPositionService({
      repository: positionsRepo,
      items: itemsRepo,
      movements: movementsRepo,
    });

    const p = await svc.refresh(TENANT, item.id);
    expect(p.onHandQuantity).toBe(70);
    expect(p.stockValueMinor).toBe(350000); // 70 × 5000
    expect(p.belowReorder).toBe(false);

    const p2 = await svc.refresh(TENANT, item.id);
    expect(p2.id).toBe(p.id);
    expect(p2.version).toBe(2);

    const summary = await svc.stockSummaryFor(TENANT, ORG);
    expect(summary.itemCount).toBe(1);
    expect(summary.totalOnHandQuantity).toBe(70);
    expect(summary.belowReorderCount).toBe(0);
  });
});
