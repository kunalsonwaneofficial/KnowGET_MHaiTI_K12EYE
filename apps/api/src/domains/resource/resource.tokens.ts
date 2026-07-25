/** Dependency-injection tokens for the Procurement, Inventory & Assets Platform (P2-D15). */

// Repositories (Prisma/RLS adapters over the resource ports).
export const RES_SUPPLIER_REPOSITORY = Symbol("RES_SUPPLIER_REPOSITORY");
export const RES_ITEM_REPOSITORY = Symbol("RES_ITEM_REPOSITORY");
export const RES_STOCK_MOVEMENT_REPOSITORY = Symbol("RES_STOCK_MOVEMENT_REPOSITORY");
export const RES_REQUISITION_REPOSITORY = Symbol("RES_REQUISITION_REPOSITORY");
export const RES_ORDER_REPOSITORY = Symbol("RES_ORDER_REPOSITORY");
export const RES_ASSET_REPOSITORY = Symbol("RES_ASSET_REPOSITORY");
export const RES_MAINTENANCE_REPOSITORY = Symbol("RES_MAINTENANCE_REPOSITORY");
export const RES_POSITION_REPOSITORY = Symbol("RES_POSITION_REPOSITORY");

// Cross-domain read ports (directories over Organization and Workforce Employee).
export const RES_ORGANIZATION_DIRECTORY = Symbol("RES_ORGANIZATION_DIRECTORY");
export const RES_EMPLOYEE_DIRECTORY = Symbol("RES_EMPLOYEE_DIRECTORY");

// Application services.
export const RES_SUPPLIER_SERVICE = Symbol("RES_SUPPLIER_SERVICE");
export const RES_ITEM_SERVICE = Symbol("RES_ITEM_SERVICE");
export const RES_STOCK_MOVEMENT_SERVICE = Symbol("RES_STOCK_MOVEMENT_SERVICE");
export const RES_REQUISITION_SERVICE = Symbol("RES_REQUISITION_SERVICE");
export const RES_ORDER_SERVICE = Symbol("RES_ORDER_SERVICE");
export const RES_ASSET_SERVICE = Symbol("RES_ASSET_SERVICE");
export const RES_MAINTENANCE_SERVICE = Symbol("RES_MAINTENANCE_SERVICE");
export const RES_POSITION_SERVICE = Symbol("RES_POSITION_SERVICE");
