import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { SupplierNotActiveError } from "./errors";
import { createInventoryItem } from "./inventory-item";
import {
  InMemoryInventoryItemRepository,
  InMemoryPurchaseOrderRepository,
  InMemoryStockMovementRepository,
  InMemorySupplierRepository,
} from "./ports";
import { PurchaseOrderService } from "./purchase-order-service";
import { StockMovementService } from "./stock-movement-service";
import { createSupplier, suspendSupplier } from "./supplier";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;

async function harness() {
  const events: DomainEvent[] = [];
  const publish = async (e: DomainEvent) => void events.push(e);
  const supplierRepo = new InMemorySupplierRepository();
  const supplier = createSupplier({
    tenantId: TENANT,
    organizationId: ORG,
    code: "ACME",
    name: "Acme",
  });
  await supplierRepo.save(supplier);
  const itemsRepo = new InMemoryInventoryItemRepository();
  const item = createInventoryItem({
    tenantId: TENANT,
    organizationId: ORG,
    sku: "PEN-BLUE",
    name: "Blue Pen",
    unitOfMeasure: "box",
    reorderLevel: 5,
  });
  await itemsRepo.save(item);
  const stockMovements = new StockMovementService({
    repository: new InMemoryStockMovementRepository(),
    items: itemsRepo,
    events: { publish },
  });
  const orders = new PurchaseOrderService({
    repository: new InMemoryPurchaseOrderRepository(),
    suppliers: supplierRepo,
    stockMovements,
    events: { publish },
  });
  return { orders, stockMovements, events, supplier, supplierRepo, item };
}

describe("PurchaseOrderService (receiving posts stock)", () => {
  it("issues to an active supplier, receives in parts, and posts stock each time", async () => {
    const { orders, stockMovements, events, supplier, item } = await harness();
    const po = await orders.draft({
      tenantId: TENANT,
      supplierId: supplier.id,
      number: "PO-1",
      currency: "INR",
      lines: [
        { key: "pens", itemId: item.id, description: "Pens", quantity: 100, unitPriceMinor: 5000 },
      ],
    });
    expect(po.organizationId).toBe(ORG);
    await orders.issue(TENANT, po.id);

    await orders.receive(TENANT, po.id, "pens", 40, "2025-05-02");
    expect((await stockMovements.positionForItem(TENANT, item.id)).onHandQuantity).toBe(40);
    expect((await orders.getById(TENANT, po.id)).status).toBe("partially_received");

    await orders.receive(TENANT, po.id, "pens", 60, "2025-05-03");
    expect((await stockMovements.positionForItem(TENANT, item.id)).onHandQuantity).toBe(100);
    expect((await orders.getById(TENANT, po.id)).status).toBe("received");

    expect(events.map((e) => e.type)).toContain("resource.purchase_order.received");
    expect(events.filter((e) => e.type === "resource.stock.movement_recorded")).toHaveLength(2);
  });

  it("refuses to issue to a supplier that is not active", async () => {
    const { orders, supplier, supplierRepo } = await harness();
    await supplierRepo.save(suspendSupplier(supplier));
    const po = await orders.draft({
      tenantId: TENANT,
      supplierId: supplier.id,
      number: "PO-2",
      currency: "INR",
      lines: [{ key: "a", description: "A", quantity: 1, unitPriceMinor: 100 }],
    });
    await expect(orders.issue(TENANT, po.id)).rejects.toBeInstanceOf(SupplierNotActiveError);
  });
});
