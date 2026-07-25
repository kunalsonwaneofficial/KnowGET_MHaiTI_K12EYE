import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { AssetController } from "./asset.controller";
import { AssetMaintenanceController } from "./asset-maintenance.controller";
import { InventoryItemController } from "./inventory-item.controller";
import { InventoryPositionController } from "./inventory-position.controller";
import { PurchaseOrderController } from "./purchase-order.controller";
import { PurchaseRequisitionController } from "./purchase-requisition.controller";
import { ResourceModule } from "./resource.module";
import {
  RES_ASSET_SERVICE,
  RES_ITEM_SERVICE,
  RES_MAINTENANCE_SERVICE,
  RES_ORDER_SERVICE,
  RES_POSITION_SERVICE,
  RES_REQUISITION_SERVICE,
  RES_STOCK_MOVEMENT_SERVICE,
  RES_SUPPLIER_SERVICE,
} from "./resource.tokens";
import { StockMovementController } from "./stock-movement.controller";
import { SupplierController } from "./supplier.controller";

/**
 * Stands in for the global platform providers (database handle, event bus) the domain modules inject,
 * so the resource DI graph — including the imported Organization and Workforce modules — compiles
 * without a live database. The Prisma adapters only store the handle at construction.
 */
@Global()
@Module({
  providers: [
    { provide: DATABASE, useValue: {} },
    { provide: EVENT_BUS, useValue: { publish: async () => undefined } },
  ],
  exports: [DATABASE, EVENT_BUS],
})
class MockGlobalsModule {}

describe("ResourceModule (integration)", () => {
  it("compiles the full resource DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, ResourceModule],
    }).compile();

    expect(moduleRef.get(SupplierController)).toBeInstanceOf(SupplierController);
    expect(moduleRef.get(InventoryItemController)).toBeInstanceOf(InventoryItemController);
    expect(moduleRef.get(StockMovementController)).toBeInstanceOf(StockMovementController);
    expect(moduleRef.get(PurchaseRequisitionController)).toBeInstanceOf(
      PurchaseRequisitionController,
    );
    expect(moduleRef.get(PurchaseOrderController)).toBeInstanceOf(PurchaseOrderController);
    expect(moduleRef.get(InventoryPositionController)).toBeInstanceOf(InventoryPositionController);
    expect(moduleRef.get(AssetController)).toBeInstanceOf(AssetController);
    expect(moduleRef.get(AssetMaintenanceController)).toBeInstanceOf(AssetMaintenanceController);

    await moduleRef.close();
  });

  it("exposes each aggregate's application service for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, ResourceModule],
    }).compile();

    for (const token of [
      RES_SUPPLIER_SERVICE,
      RES_ITEM_SERVICE,
      RES_STOCK_MOVEMENT_SERVICE,
      RES_REQUISITION_SERVICE,
      RES_ORDER_SERVICE,
      RES_POSITION_SERVICE,
      RES_ASSET_SERVICE,
      RES_MAINTENANCE_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
