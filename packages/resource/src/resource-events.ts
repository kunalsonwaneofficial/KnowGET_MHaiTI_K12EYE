import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { Asset } from "./asset";
import type { AssetMaintenance } from "./asset-maintenance";
import type { InventoryItem } from "./inventory-item";
import { type PurchaseOrder, purchaseOrderTotalMinor } from "./purchase-order";
import { type PurchaseRequisition, requisitionTotalMinor } from "./purchase-requisition";
import type { StockMovement } from "./stock-movement";
import type { Supplier } from "./supplier";

// --- Supplier --------------------------------------------------------------------
export const SUPPLIER_REGISTERED = "resource.supplier.registered";
export const SUPPLIER_SUSPENDED = "resource.supplier.suspended";
export const SUPPLIER_REINSTATED = "resource.supplier.reinstated";
export const SUPPLIER_BLACKLISTED = "resource.supplier.blacklisted";

export interface SupplierEventPayload {
  readonly supplierId: Uuid;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly status: string;
}

export type SupplierRegisteredEvent = DomainEvent<typeof SUPPLIER_REGISTERED, SupplierEventPayload>;
export type SupplierSuspendedEvent = DomainEvent<typeof SUPPLIER_SUSPENDED, SupplierEventPayload>;
export type SupplierReinstatedEvent = DomainEvent<typeof SUPPLIER_REINSTATED, SupplierEventPayload>;
export type SupplierBlacklistedEvent = DomainEvent<
  typeof SUPPLIER_BLACKLISTED,
  SupplierEventPayload
>;

const supplierPayload = (supplier: Supplier): SupplierEventPayload => ({
  supplierId: supplier.id,
  organizationId: supplier.organizationId,
  code: supplier.code,
  status: supplier.status,
});

export const supplierRegistered = (supplier: Supplier): SupplierRegisteredEvent =>
  createEvent(SUPPLIER_REGISTERED, supplierPayload(supplier), { tenantId: supplier.tenantId });

export const supplierSuspended = (supplier: Supplier): SupplierSuspendedEvent =>
  createEvent(SUPPLIER_SUSPENDED, supplierPayload(supplier), { tenantId: supplier.tenantId });

export const supplierReinstated = (supplier: Supplier): SupplierReinstatedEvent =>
  createEvent(SUPPLIER_REINSTATED, supplierPayload(supplier), { tenantId: supplier.tenantId });

export const supplierBlacklisted = (supplier: Supplier): SupplierBlacklistedEvent =>
  createEvent(SUPPLIER_BLACKLISTED, supplierPayload(supplier), { tenantId: supplier.tenantId });

// --- Inventory item --------------------------------------------------------------
export const ITEM_CREATED = "resource.item.created";
export const ITEM_DISCONTINUED = "resource.item.discontinued";
export const ITEM_REACTIVATED = "resource.item.reactivated";

export interface ItemEventPayload {
  readonly itemId: Uuid;
  readonly organizationId: Uuid;
  readonly sku: string;
  readonly status: string;
}

export type ItemCreatedEvent = DomainEvent<typeof ITEM_CREATED, ItemEventPayload>;
export type ItemDiscontinuedEvent = DomainEvent<typeof ITEM_DISCONTINUED, ItemEventPayload>;
export type ItemReactivatedEvent = DomainEvent<typeof ITEM_REACTIVATED, ItemEventPayload>;

const itemPayload = (item: InventoryItem): ItemEventPayload => ({
  itemId: item.id,
  organizationId: item.organizationId,
  sku: item.sku,
  status: item.status,
});

export const itemCreated = (item: InventoryItem): ItemCreatedEvent =>
  createEvent(ITEM_CREATED, itemPayload(item), { tenantId: item.tenantId });

export const itemDiscontinued = (item: InventoryItem): ItemDiscontinuedEvent =>
  createEvent(ITEM_DISCONTINUED, itemPayload(item), { tenantId: item.tenantId });

export const itemReactivated = (item: InventoryItem): ItemReactivatedEvent =>
  createEvent(ITEM_REACTIVATED, itemPayload(item), { tenantId: item.tenantId });

// --- Stock movement --------------------------------------------------------------
export const STOCK_MOVEMENT_RECORDED = "resource.stock.movement_recorded";

export interface StockMovementRecordedPayload {
  readonly movementId: Uuid;
  readonly organizationId: Uuid;
  readonly itemId: Uuid;
  readonly type: string;
  readonly quantity: number;
}

export type StockMovementRecordedEvent = DomainEvent<
  typeof STOCK_MOVEMENT_RECORDED,
  StockMovementRecordedPayload
>;

export const stockMovementRecorded = (movement: StockMovement): StockMovementRecordedEvent =>
  createEvent(
    STOCK_MOVEMENT_RECORDED,
    {
      movementId: movement.id,
      organizationId: movement.organizationId,
      itemId: movement.itemId,
      type: movement.type,
      quantity: movement.quantity,
    },
    { tenantId: movement.tenantId },
  );

// --- Purchase requisition --------------------------------------------------------
export const REQUISITION_SUBMITTED = "resource.requisition.submitted";
export const REQUISITION_APPROVED = "resource.requisition.approved";
export const REQUISITION_REJECTED = "resource.requisition.rejected";

export interface RequisitionEventPayload {
  readonly requisitionId: Uuid;
  readonly organizationId: Uuid;
  readonly requesterId: Uuid;
  readonly totalMinor: number;
  readonly currency: string;
  readonly status: string;
}

export type RequisitionSubmittedEvent = DomainEvent<
  typeof REQUISITION_SUBMITTED,
  RequisitionEventPayload
>;
export type RequisitionApprovedEvent = DomainEvent<
  typeof REQUISITION_APPROVED,
  RequisitionEventPayload
>;
export type RequisitionRejectedEvent = DomainEvent<
  typeof REQUISITION_REJECTED,
  RequisitionEventPayload
>;

const requisitionPayload = (requisition: PurchaseRequisition): RequisitionEventPayload => ({
  requisitionId: requisition.id,
  organizationId: requisition.organizationId,
  requesterId: requisition.requesterId,
  totalMinor: requisitionTotalMinor(requisition),
  currency: requisition.currency,
  status: requisition.status,
});

export const requisitionSubmitted = (requisition: PurchaseRequisition): RequisitionSubmittedEvent =>
  createEvent(REQUISITION_SUBMITTED, requisitionPayload(requisition), {
    tenantId: requisition.tenantId,
  });

export const requisitionApproved = (requisition: PurchaseRequisition): RequisitionApprovedEvent =>
  createEvent(REQUISITION_APPROVED, requisitionPayload(requisition), {
    tenantId: requisition.tenantId,
  });

export const requisitionRejected = (requisition: PurchaseRequisition): RequisitionRejectedEvent =>
  createEvent(REQUISITION_REJECTED, requisitionPayload(requisition), {
    tenantId: requisition.tenantId,
  });

// --- Purchase order --------------------------------------------------------------
export const PURCHASE_ORDER_ISSUED = "resource.purchase_order.issued";
export const PURCHASE_ORDER_RECEIVED = "resource.purchase_order.received";
export const PURCHASE_ORDER_CLOSED = "resource.purchase_order.closed";
export const PURCHASE_ORDER_CANCELLED = "resource.purchase_order.cancelled";

export interface PurchaseOrderEventPayload {
  readonly orderId: Uuid;
  readonly organizationId: Uuid;
  readonly supplierId: Uuid;
  readonly number: string;
  readonly totalMinor: number;
  readonly currency: string;
  readonly status: string;
}

export type PurchaseOrderIssuedEvent = DomainEvent<
  typeof PURCHASE_ORDER_ISSUED,
  PurchaseOrderEventPayload
>;
export type PurchaseOrderReceivedEvent = DomainEvent<
  typeof PURCHASE_ORDER_RECEIVED,
  PurchaseOrderEventPayload
>;
export type PurchaseOrderClosedEvent = DomainEvent<
  typeof PURCHASE_ORDER_CLOSED,
  PurchaseOrderEventPayload
>;
export type PurchaseOrderCancelledEvent = DomainEvent<
  typeof PURCHASE_ORDER_CANCELLED,
  PurchaseOrderEventPayload
>;

const purchaseOrderPayload = (order: PurchaseOrder): PurchaseOrderEventPayload => ({
  orderId: order.id,
  organizationId: order.organizationId,
  supplierId: order.supplierId,
  number: order.number,
  totalMinor: purchaseOrderTotalMinor(order),
  currency: order.currency,
  status: order.status,
});

export const purchaseOrderIssued = (order: PurchaseOrder): PurchaseOrderIssuedEvent =>
  createEvent(PURCHASE_ORDER_ISSUED, purchaseOrderPayload(order), { tenantId: order.tenantId });

export const purchaseOrderReceived = (order: PurchaseOrder): PurchaseOrderReceivedEvent =>
  createEvent(PURCHASE_ORDER_RECEIVED, purchaseOrderPayload(order), { tenantId: order.tenantId });

export const purchaseOrderClosed = (order: PurchaseOrder): PurchaseOrderClosedEvent =>
  createEvent(PURCHASE_ORDER_CLOSED, purchaseOrderPayload(order), { tenantId: order.tenantId });

export const purchaseOrderCancelled = (order: PurchaseOrder): PurchaseOrderCancelledEvent =>
  createEvent(PURCHASE_ORDER_CANCELLED, purchaseOrderPayload(order), { tenantId: order.tenantId });

// --- Asset -----------------------------------------------------------------------
export const ASSET_REGISTERED = "resource.asset.registered";
export const ASSET_RETIRED = "resource.asset.retired";
export const ASSET_DISPOSED = "resource.asset.disposed";

export interface AssetEventPayload {
  readonly assetId: Uuid;
  readonly organizationId: Uuid;
  readonly assetTag: string;
  readonly status: string;
}

export type AssetRegisteredEvent = DomainEvent<typeof ASSET_REGISTERED, AssetEventPayload>;
export type AssetRetiredEvent = DomainEvent<typeof ASSET_RETIRED, AssetEventPayload>;
export type AssetDisposedEvent = DomainEvent<typeof ASSET_DISPOSED, AssetEventPayload>;

const assetPayload = (asset: Asset): AssetEventPayload => ({
  assetId: asset.id,
  organizationId: asset.organizationId,
  assetTag: asset.assetTag,
  status: asset.status,
});

export const assetRegistered = (asset: Asset): AssetRegisteredEvent =>
  createEvent(ASSET_REGISTERED, assetPayload(asset), { tenantId: asset.tenantId });

export const assetRetired = (asset: Asset): AssetRetiredEvent =>
  createEvent(ASSET_RETIRED, assetPayload(asset), { tenantId: asset.tenantId });

export const assetDisposed = (asset: Asset): AssetDisposedEvent =>
  createEvent(ASSET_DISPOSED, assetPayload(asset), { tenantId: asset.tenantId });

// --- Asset maintenance -----------------------------------------------------------
export const MAINTENANCE_SCHEDULED = "resource.maintenance.scheduled";
export const MAINTENANCE_COMPLETED = "resource.maintenance.completed";

export interface MaintenanceEventPayload {
  readonly maintenanceId: Uuid;
  readonly organizationId: Uuid;
  readonly assetId: Uuid;
  readonly status: string;
}

export type MaintenanceScheduledEvent = DomainEvent<
  typeof MAINTENANCE_SCHEDULED,
  MaintenanceEventPayload
>;
export type MaintenanceCompletedEvent = DomainEvent<
  typeof MAINTENANCE_COMPLETED,
  MaintenanceEventPayload
>;

const maintenancePayload = (maintenance: AssetMaintenance): MaintenanceEventPayload => ({
  maintenanceId: maintenance.id,
  organizationId: maintenance.organizationId,
  assetId: maintenance.assetId,
  status: maintenance.status,
});

export const maintenanceScheduled = (maintenance: AssetMaintenance): MaintenanceScheduledEvent =>
  createEvent(MAINTENANCE_SCHEDULED, maintenancePayload(maintenance), {
    tenantId: maintenance.tenantId,
  });

export const maintenanceCompleted = (maintenance: AssetMaintenance): MaintenanceCompletedEvent =>
  createEvent(MAINTENANCE_COMPLETED, maintenancePayload(maintenance), {
    tenantId: maintenance.tenantId,
  });
