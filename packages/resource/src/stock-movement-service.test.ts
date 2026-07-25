import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { InsufficientStockError, InventoryItemNotFoundError } from "./errors";
import { createInventoryItem } from "./inventory-item";
import { InMemoryInventoryItemRepository, InMemoryStockMovementRepository } from "./ports";
import { StockMovementService } from "./stock-movement-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;

async function harness() {
  const events: DomainEvent[] = [];
  const items = new InMemoryInventoryItemRepository();
  const item = createInventoryItem({
    tenantId: TENANT,
    organizationId: ORG,
    sku: "PEN-BLUE",
    name: "Blue Pen",
    unitOfMeasure: "box",
    reorderLevel: 20,
  });
  await items.save(item);
  const svc = new StockMovementService({
    repository: new InMemoryStockMovementRepository(),
    items,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events, itemId: item.id };
}

describe("StockMovementService", () => {
  it("records receipts and issues, enforcing available stock", async () => {
    const { svc, events, itemId } = await harness();
    await svc.record({
      tenantId: TENANT,
      itemId,
      type: "receipt",
      quantity: 100,
      occurredAt: "2025-05-01",
    });
    await svc.record({
      tenantId: TENANT,
      itemId,
      type: "issue",
      quantity: 30,
      occurredAt: "2025-05-02",
    });

    const position = await svc.positionForItem(TENANT, itemId);
    expect(position.onHandQuantity).toBe(70);
    expect(position.belowReorder).toBe(false);

    await expect(
      svc.record({
        tenantId: TENANT,
        itemId,
        type: "issue",
        quantity: 100,
        occurredAt: "2025-05-03",
      }),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    expect(events.map((e) => e.type)).toEqual([
      "resource.stock.movement_recorded",
      "resource.stock.movement_recorded",
    ]);
  });

  it("rejects a movement against an unknown item", async () => {
    const { svc } = await harness();
    await expect(
      svc.record({
        tenantId: TENANT,
        itemId: "00000000-0000-0000-0000-000000000000" as Uuid,
        type: "receipt",
        quantity: 1,
        occurredAt: "2025-05-01",
      }),
    ).rejects.toBeInstanceOf(InventoryItemNotFoundError);
  });
});
