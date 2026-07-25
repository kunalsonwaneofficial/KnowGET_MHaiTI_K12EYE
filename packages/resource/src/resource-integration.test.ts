import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { AssetMaintenanceService } from "./asset-maintenance-service";
import { AssetService } from "./asset-service";
import { InventoryItemService } from "./inventory-item-service";
import { InventoryPositionService } from "./inventory-position-service";
import {
  type EmployeeDirectory,
  InMemoryAssetMaintenanceRepository,
  InMemoryAssetRepository,
  InMemoryInventoryItemRepository,
  InMemoryInventoryPositionRepository,
  InMemoryPurchaseOrderRepository,
  InMemoryPurchaseRequisitionRepository,
  InMemoryStockMovementRepository,
  InMemorySupplierRepository,
  type OrganizationDirectory,
} from "./ports";
import { PurchaseOrderService } from "./purchase-order-service";
import { PurchaseRequisitionService } from "./purchase-requisition-service";
import { StockMovementService } from "./stock-movement-service";
import { SupplierService } from "./supplier-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const EMP = "44444444-4444-4444-4444-444444444444" as Uuid;

const organizations: OrganizationDirectory = { exists: async (_t, id) => id === ORG };
const employees: EmployeeDirectory = {
  exists: async (_t, id) => id === EMP,
  organizationOf: async (_t, id) => (id === EMP ? ORG : null),
};

describe("resource spine (end to end)", () => {
  it("runs supplier → item → requisition → PO → receipt → stock → asset → depreciation", async () => {
    const itemsRepo = new InMemoryInventoryItemRepository();
    const movementsRepo = new InMemoryStockMovementRepository();
    const supplierRepo = new InMemorySupplierRepository();

    const suppliers = new SupplierService({ repository: supplierRepo, organizations });
    const items = new InventoryItemService({ repository: itemsRepo, organizations });
    const stockMovements = new StockMovementService({
      repository: movementsRepo,
      items: itemsRepo,
    });
    const requisitions = new PurchaseRequisitionService({
      repository: new InMemoryPurchaseRequisitionRepository(),
      employees,
    });
    const orders = new PurchaseOrderService({
      repository: new InMemoryPurchaseOrderRepository(),
      suppliers: supplierRepo,
      stockMovements,
    });
    const positions = new InventoryPositionService({
      repository: new InMemoryInventoryPositionRepository(),
      items: itemsRepo,
      movements: movementsRepo,
    });
    const assetRepo = new InMemoryAssetRepository();
    const assets = new AssetService({ repository: assetRepo, organizations, employees });
    const maintenance = new AssetMaintenanceService({
      repository: new InMemoryAssetMaintenanceRepository(),
      assets: assetRepo,
    });

    // 1. A supplier and a stockable item (standard cost 5000 minor units).
    const supplier = await suppliers.create({
      tenantId: TENANT,
      organizationId: ORG,
      code: "ACME",
      name: "Acme Supplies",
    });
    const item = await items.create({
      tenantId: TENANT,
      organizationId: ORG,
      sku: "PEN-BLUE",
      name: "Blue Pen",
      unitOfMeasure: "box",
      reorderLevel: 20,
      standardCostMinor: 5000,
      currency: "INR",
    });

    // 2. A requisition, approved.
    const req = await requisitions.draft({
      tenantId: TENANT,
      requesterId: EMP,
      title: "Classroom pens",
      currency: "INR",
      lines: [
        { key: "pens", description: "Blue pens", quantity: 100, estimatedUnitCostMinor: 5000 },
      ],
    });
    await requisitions.submit(TENANT, req.id);
    await requisitions.approve(TENANT, req.id, "Approved");

    // 3. A purchase order from the requisition, issued and fully received (posting stock).
    const po = await orders.draft({
      tenantId: TENANT,
      supplierId: supplier.id,
      number: "PO-2025-1",
      currency: "INR",
      requisitionId: req.id,
      lines: [
        {
          key: "pens",
          itemId: item.id,
          description: "Blue pens",
          quantity: 100,
          unitPriceMinor: 5000,
        },
      ],
    });
    await orders.issue(TENANT, po.id);
    await orders.receive(TENANT, po.id, "pens", 100, "2025-05-05");
    expect((await orders.getById(TENANT, po.id)).status).toBe("received");

    // 4. Reconcile the inventory position — 100 on hand, valued at standard cost.
    let position = await positions.refresh(TENANT, item.id);
    expect(position.onHandQuantity).toBe(100);
    expect(position.stockValueMinor).toBe(500000); // 100 × 5000
    expect(position.belowReorder).toBe(false);

    // 5. Issue most of the stock to a department; reconcile — now below reorder.
    await stockMovements.record({
      tenantId: TENANT,
      itemId: item.id,
      type: "issue",
      quantity: 90,
      occurredAt: "2025-05-10",
    });
    position = await positions.refresh(TENANT, item.id);
    expect(position.onHandQuantity).toBe(10);
    expect(position.belowReorder).toBe(true); // 10 <= 20
    expect(position.version).toBe(2);

    // 6. A fixed asset, depreciated as of a date.
    const asset = await assets.register({
      tenantId: TENANT,
      organizationId: ORG,
      assetTag: "LAP-1",
      name: "Staff Laptop",
      acquisitionCostMinor: 6000000,
      salvageValueMinor: 600000,
      currency: "INR",
      acquisitionDate: "2025-01-15",
      usefulLifeMonths: 36,
      custodianId: EMP,
    });
    const dep = await assets.depreciationAsOf(TENANT, asset.id, "2026-07-15"); // 18 months
    expect(dep.netBookValueMinor).toBe(3300000);

    // 7. Maintenance against the asset.
    const maint = await maintenance.schedule({
      tenantId: TENANT,
      assetId: asset.id,
      description: "Warranty service",
    });
    const done = await maintenance.complete(TENANT, maint.id, {
      performedDate: "2025-06-01",
      costMinor: 100000,
      currency: "INR",
    });
    expect(done.status).toBe("completed");

    // 8. The organization stock rollup — one item, ten on hand, one below reorder.
    const summary = await positions.stockSummaryFor(TENANT, ORG);
    expect(summary.itemCount).toBe(1);
    expect(summary.totalOnHandQuantity).toBe(10);
    expect(summary.belowReorderCount).toBe(1);
  });
});
