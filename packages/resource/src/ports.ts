import type { TenantId, Uuid } from "@knowget/types";
import type { InventoryItem } from "./inventory-item";
import type { PurchaseOrder } from "./purchase-order";
import type { PurchaseRequisition } from "./purchase-requisition";
import type { StockMovement } from "./stock-movement";
import type { Supplier } from "./supplier";

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node exist in the
 * tenant? Suppliers, items, orders and assets attach to it; the resource domain links to it and never
 * depends on `@knowget/organization` directly.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Read model over the workforce domain (P2-D12): a requester, custodian or approver is an Employee.
 * `exists` answers presence; `organizationOf` resolves the employee's organization (or `null` if
 * unknown) so a requisition derives its organization from the staff member who raised it. The resource
 * domain links to workforce and never depends on `@knowget/workforce` directly.
 */
export interface EmployeeDirectory {
  exists(tenantId: TenantId, employeeId: Uuid): Promise<boolean>;
  organizationOf(tenantId: TenantId, employeeId: Uuid): Promise<Uuid | null>;
}

/** Storage contract for suppliers. Tenant-scoped (explicit argument + RLS). */
export interface SupplierRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Supplier | null>;
  findByCode(tenantId: TenantId, code: string): Promise<Supplier | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Supplier[]>;
  listByTenant(tenantId: TenantId): Promise<Supplier[]>;
  save(supplier: Supplier): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link SupplierRepository} — the default for tests and bootstrap. */
export class InMemorySupplierRepository implements SupplierRepository {
  private readonly byId = new Map<string, Supplier>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Supplier | null> {
    const supplier = this.byId.get(id);
    return supplier && supplier.tenantId === tenantId ? supplier : null;
  }

  async findByCode(tenantId: TenantId, code: string): Promise<Supplier | null> {
    return [...this.byId.values()].find((s) => s.tenantId === tenantId && s.code === code) ?? null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Supplier[]> {
    return [...this.byId.values()].filter(
      (s) => s.tenantId === tenantId && s.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Supplier[]> {
    return [...this.byId.values()].filter((s) => s.tenantId === tenantId);
  }

  async save(supplier: Supplier): Promise<void> {
    this.byId.set(supplier.id, supplier);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const supplier = this.byId.get(id);
    if (supplier && supplier.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for inventory items. Tenant-scoped (explicit argument + RLS). */
export interface InventoryItemRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<InventoryItem | null>;
  findBySku(tenantId: TenantId, sku: string): Promise<InventoryItem | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<InventoryItem[]>;
  listByTenant(tenantId: TenantId): Promise<InventoryItem[]>;
  save(item: InventoryItem): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link InventoryItemRepository} — the default for tests and bootstrap. */
export class InMemoryInventoryItemRepository implements InventoryItemRepository {
  private readonly byId = new Map<string, InventoryItem>();

  async findById(tenantId: TenantId, id: Uuid): Promise<InventoryItem | null> {
    const item = this.byId.get(id);
    return item && item.tenantId === tenantId ? item : null;
  }

  async findBySku(tenantId: TenantId, sku: string): Promise<InventoryItem | null> {
    return [...this.byId.values()].find((i) => i.tenantId === tenantId && i.sku === sku) ?? null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<InventoryItem[]> {
    return [...this.byId.values()].filter(
      (i) => i.tenantId === tenantId && i.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<InventoryItem[]> {
    return [...this.byId.values()].filter((i) => i.tenantId === tenantId);
  }

  async save(item: InventoryItem): Promise<void> {
    this.byId.set(item.id, item);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const item = this.byId.get(id);
    if (item && item.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for stock movements (append-only ledger). Tenant-scoped (argument + RLS). */
export interface StockMovementRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<StockMovement | null>;
  listByItem(tenantId: TenantId, itemId: Uuid): Promise<StockMovement[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<StockMovement[]>;
  listByTenant(tenantId: TenantId): Promise<StockMovement[]>;
  save(movement: StockMovement): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link StockMovementRepository} — the default for tests and bootstrap. */
export class InMemoryStockMovementRepository implements StockMovementRepository {
  private readonly byId = new Map<string, StockMovement>();

  async findById(tenantId: TenantId, id: Uuid): Promise<StockMovement | null> {
    const movement = this.byId.get(id);
    return movement && movement.tenantId === tenantId ? movement : null;
  }

  async listByItem(tenantId: TenantId, itemId: Uuid): Promise<StockMovement[]> {
    return [...this.byId.values()].filter((m) => m.tenantId === tenantId && m.itemId === itemId);
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<StockMovement[]> {
    return [...this.byId.values()].filter(
      (m) => m.tenantId === tenantId && m.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<StockMovement[]> {
    return [...this.byId.values()].filter((m) => m.tenantId === tenantId);
  }

  async save(movement: StockMovement): Promise<void> {
    this.byId.set(movement.id, movement);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const movement = this.byId.get(id);
    if (movement && movement.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for purchase requisitions. Tenant-scoped (explicit argument + RLS). */
export interface PurchaseRequisitionRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<PurchaseRequisition | null>;
  listByRequester(tenantId: TenantId, requesterId: Uuid): Promise<PurchaseRequisition[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<PurchaseRequisition[]>;
  listByTenant(tenantId: TenantId): Promise<PurchaseRequisition[]>;
  save(requisition: PurchaseRequisition): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link PurchaseRequisitionRepository} — the default for tests and bootstrap. */
export class InMemoryPurchaseRequisitionRepository implements PurchaseRequisitionRepository {
  private readonly byId = new Map<string, PurchaseRequisition>();

  async findById(tenantId: TenantId, id: Uuid): Promise<PurchaseRequisition | null> {
    const requisition = this.byId.get(id);
    return requisition && requisition.tenantId === tenantId ? requisition : null;
  }

  async listByRequester(tenantId: TenantId, requesterId: Uuid): Promise<PurchaseRequisition[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.requesterId === requesterId,
    );
  }

  async listByOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<PurchaseRequisition[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<PurchaseRequisition[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(requisition: PurchaseRequisition): Promise<void> {
    this.byId.set(requisition.id, requisition);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const requisition = this.byId.get(id);
    if (requisition && requisition.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for purchase orders. Tenant-scoped (explicit argument + RLS). */
export interface PurchaseOrderRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<PurchaseOrder | null>;
  findByNumber(tenantId: TenantId, number: string): Promise<PurchaseOrder | null>;
  listBySupplier(tenantId: TenantId, supplierId: Uuid): Promise<PurchaseOrder[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<PurchaseOrder[]>;
  listByTenant(tenantId: TenantId): Promise<PurchaseOrder[]>;
  save(order: PurchaseOrder): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link PurchaseOrderRepository} — the default for tests and bootstrap. */
export class InMemoryPurchaseOrderRepository implements PurchaseOrderRepository {
  private readonly byId = new Map<string, PurchaseOrder>();

  async findById(tenantId: TenantId, id: Uuid): Promise<PurchaseOrder | null> {
    const order = this.byId.get(id);
    return order && order.tenantId === tenantId ? order : null;
  }

  async findByNumber(tenantId: TenantId, number: string): Promise<PurchaseOrder | null> {
    return (
      [...this.byId.values()].find((o) => o.tenantId === tenantId && o.number === number) ?? null
    );
  }

  async listBySupplier(tenantId: TenantId, supplierId: Uuid): Promise<PurchaseOrder[]> {
    return [...this.byId.values()].filter(
      (o) => o.tenantId === tenantId && o.supplierId === supplierId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<PurchaseOrder[]> {
    return [...this.byId.values()].filter(
      (o) => o.tenantId === tenantId && o.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<PurchaseOrder[]> {
    return [...this.byId.values()].filter((o) => o.tenantId === tenantId);
  }

  async save(order: PurchaseOrder): Promise<void> {
    this.byId.set(order.id, order);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const order = this.byId.get(id);
    if (order && order.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
