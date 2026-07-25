import type { TenantId, Uuid } from "@knowget/types";
import type { InventoryItem } from "./inventory-item";
import type { Supplier } from "./supplier";

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node exist in the
 * tenant? Suppliers, items, orders and assets attach to it; the resource domain links to it and never
 * depends on `@knowget/organization` directly.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
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
