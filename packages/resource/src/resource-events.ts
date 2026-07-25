import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { InventoryItem } from "./inventory-item";
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
