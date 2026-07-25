import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import type { OrganizationService } from "@knowget/organization";
import {
  AssetMaintenanceService,
  type AssetMaintenanceRepository,
  type AssetRepository,
  AssetService,
  type EmployeeDirectory,
  type InventoryItemRepository,
  InventoryItemService,
  type InventoryPositionRepository,
  InventoryPositionService,
  type OrganizationDirectory,
  type PurchaseOrderRepository,
  PurchaseOrderService,
  type PurchaseRequisitionRepository,
  PurchaseRequisitionService,
  type StockMovementRepository,
  StockMovementService,
  type SupplierRepository,
  SupplierService,
} from "@knowget/resource";
import type { EmployeeService } from "@knowget/workforce";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { OrganizationModule } from "../organization/organization.module";
import { ORGANIZATION_SERVICE } from "../organization/organization.tokens";
import { WorkforceModule } from "../workforce/workforce.module";
import { WF_EMPLOYEE_SERVICE } from "../workforce/workforce.tokens";
import { AssetController } from "./asset.controller";
import { AssetMaintenanceController } from "./asset-maintenance.controller";
import { EmployeeServiceDirectory, OrganizationServiceDirectory } from "./directory.adapters";
import { InventoryItemController } from "./inventory-item.controller";
import { InventoryPositionController } from "./inventory-position.controller";
import { PrismaAssetMaintenanceRepository } from "./prisma-asset-maintenance.repository";
import { PrismaAssetRepository } from "./prisma-asset.repository";
import { PrismaInventoryItemRepository } from "./prisma-inventory-item.repository";
import { PrismaInventoryPositionRepository } from "./prisma-inventory-position.repository";
import { PrismaPurchaseOrderRepository } from "./prisma-purchase-order.repository";
import { PrismaPurchaseRequisitionRepository } from "./prisma-purchase-requisition.repository";
import { PrismaStockMovementRepository } from "./prisma-stock-movement.repository";
import { PrismaSupplierRepository } from "./prisma-supplier.repository";
import { PurchaseOrderController } from "./purchase-order.controller";
import { PurchaseRequisitionController } from "./purchase-requisition.controller";
import {
  RES_ASSET_REPOSITORY,
  RES_ASSET_SERVICE,
  RES_EMPLOYEE_DIRECTORY,
  RES_ITEM_REPOSITORY,
  RES_ITEM_SERVICE,
  RES_MAINTENANCE_REPOSITORY,
  RES_MAINTENANCE_SERVICE,
  RES_ORDER_REPOSITORY,
  RES_ORDER_SERVICE,
  RES_ORGANIZATION_DIRECTORY,
  RES_POSITION_REPOSITORY,
  RES_POSITION_SERVICE,
  RES_REQUISITION_REPOSITORY,
  RES_REQUISITION_SERVICE,
  RES_STOCK_MOVEMENT_REPOSITORY,
  RES_STOCK_MOVEMENT_SERVICE,
  RES_SUPPLIER_REPOSITORY,
  RES_SUPPLIER_SERVICE,
} from "./resource.tokens";
import { StockMovementController } from "./stock-movement.controller";
import { SupplierController } from "./supplier.controller";

const repositories: Provider[] = [
  {
    provide: RES_SUPPLIER_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaSupplierRepository(db),
    inject: [DATABASE],
  },
  {
    provide: RES_ITEM_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaInventoryItemRepository(db),
    inject: [DATABASE],
  },
  {
    provide: RES_STOCK_MOVEMENT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaStockMovementRepository(db),
    inject: [DATABASE],
  },
  {
    provide: RES_REQUISITION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaPurchaseRequisitionRepository(db),
    inject: [DATABASE],
  },
  {
    provide: RES_ORDER_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaPurchaseOrderRepository(db),
    inject: [DATABASE],
  },
  {
    provide: RES_ASSET_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAssetRepository(db),
    inject: [DATABASE],
  },
  {
    provide: RES_MAINTENANCE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAssetMaintenanceRepository(db),
    inject: [DATABASE],
  },
  {
    provide: RES_POSITION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaInventoryPositionRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: RES_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
  {
    provide: RES_EMPLOYEE_DIRECTORY,
    useFactory: (employees: EmployeeService) => new EmployeeServiceDirectory(employees),
    inject: [WF_EMPLOYEE_SERVICE],
  },
];

const services: Provider[] = [
  {
    provide: RES_SUPPLIER_SERVICE,
    useFactory: (
      repository: SupplierRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new SupplierService({ repository, organizations, events }),
    inject: [RES_SUPPLIER_REPOSITORY, RES_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: RES_ITEM_SERVICE,
    useFactory: (
      repository: InventoryItemRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new InventoryItemService({ repository, organizations, events }),
    inject: [RES_ITEM_REPOSITORY, RES_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: RES_STOCK_MOVEMENT_SERVICE,
    useFactory: (
      repository: StockMovementRepository,
      items: InventoryItemRepository,
      events: EventBus,
    ) => new StockMovementService({ repository, items, events }),
    inject: [RES_STOCK_MOVEMENT_REPOSITORY, RES_ITEM_REPOSITORY, EVENT_BUS],
  },
  {
    provide: RES_REQUISITION_SERVICE,
    useFactory: (
      repository: PurchaseRequisitionRepository,
      employees: EmployeeDirectory,
      events: EventBus,
    ) => new PurchaseRequisitionService({ repository, employees, events }),
    inject: [RES_REQUISITION_REPOSITORY, RES_EMPLOYEE_DIRECTORY, EVENT_BUS],
  },
  {
    provide: RES_ORDER_SERVICE,
    useFactory: (
      repository: PurchaseOrderRepository,
      suppliers: SupplierRepository,
      stockMovements: StockMovementService,
      events: EventBus,
    ) => new PurchaseOrderService({ repository, suppliers, stockMovements, events }),
    inject: [RES_ORDER_REPOSITORY, RES_SUPPLIER_REPOSITORY, RES_STOCK_MOVEMENT_SERVICE, EVENT_BUS],
  },
  {
    provide: RES_ASSET_SERVICE,
    useFactory: (
      repository: AssetRepository,
      organizations: OrganizationDirectory,
      employees: EmployeeDirectory,
      events: EventBus,
    ) => new AssetService({ repository, organizations, employees, events }),
    inject: [RES_ASSET_REPOSITORY, RES_ORGANIZATION_DIRECTORY, RES_EMPLOYEE_DIRECTORY, EVENT_BUS],
  },
  {
    provide: RES_MAINTENANCE_SERVICE,
    useFactory: (
      repository: AssetMaintenanceRepository,
      assets: AssetRepository,
      events: EventBus,
    ) => new AssetMaintenanceService({ repository, assets, events }),
    inject: [RES_MAINTENANCE_REPOSITORY, RES_ASSET_REPOSITORY, EVENT_BUS],
  },
  {
    provide: RES_POSITION_SERVICE,
    useFactory: (
      repository: InventoryPositionRepository,
      items: InventoryItemRepository,
      movements: StockMovementRepository,
      events: EventBus,
    ) => new InventoryPositionService({ repository, items, movements, events }),
    inject: [
      RES_POSITION_REPOSITORY,
      RES_ITEM_REPOSITORY,
      RES_STOCK_MOVEMENT_REPOSITORY,
      EVENT_BUS,
    ],
  },
];

/**
 * The Procurement, Inventory & Assets Platform (P2-D15) — the institution's resource system. Follows
 * the domain architecture pattern (ADR-0010): the pure `@knowget/resource` package (eight aggregates
 * plus the self-contained money core and the stock-balance / straight-line-depreciation engines)
 * behind repository ports, Prisma/RLS adapters, application services on the platform event bus, and
 * permission-gated, tenant-scoped REST controllers. Money is integer minor units end to end.
 * `procurement:*` gates the buy-and-hold flow (suppliers, items, the stock ledger, requisitions,
 * orders, positions); `asset:*` gates the fixed-asset register and its maintenance. Organization
 * (P2-D01-M01) and Employee (P2-D12) existence enter through injected directory ports; the resource
 * domain links to them and never depends on their packages directly. Exports every service token.
 */
@Module({
  imports: [OrganizationModule, WorkforceModule],
  controllers: [
    SupplierController,
    InventoryItemController,
    StockMovementController,
    PurchaseRequisitionController,
    PurchaseOrderController,
    InventoryPositionController,
    AssetController,
    AssetMaintenanceController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    RES_SUPPLIER_SERVICE,
    RES_ITEM_SERVICE,
    RES_STOCK_MOVEMENT_SERVICE,
    RES_REQUISITION_SERVICE,
    RES_ORDER_SERVICE,
    RES_ASSET_SERVICE,
    RES_MAINTENANCE_SERVICE,
    RES_POSITION_SERVICE,
  ],
})
export class ResourceModule {}
