import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateSkuError,
  InventoryItemNotFoundError,
  OrganizationNotFoundForResourceError,
} from "./errors";
import {
  type CreateInventoryItemParams,
  createInventoryItem,
  discontinueItem,
  type InventoryItem,
  reactivateItem,
  renameInventoryItem,
  setItemCategory,
  setItemStandardCost,
  setReorderLevel,
} from "./inventory-item";
import type { InventoryItemRepository, OrganizationDirectory } from "./ports";
import { itemCreated, itemDiscontinued, itemReactivated } from "./resource-events";

export interface InventoryItemServiceDeps {
  readonly repository: InventoryItemRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for inventory items — the stockable-goods master. Creates an item (validating the
 * organization and a unique SKU), edits its details (name, category, reorder level, standard cost), and
 * drives the `active ↔ discontinued` lifecycle, publishing the item events.
 */
export class InventoryItemService {
  private readonly repository: InventoryItemRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: InventoryItemServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async create(input: CreateInventoryItemParams): Promise<InventoryItem> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForResourceError(input.organizationId);
    }
    if (await this.repository.findBySku(input.tenantId, input.sku.trim())) {
      throw new DuplicateSkuError(input.sku.trim());
    }
    const item = createInventoryItem(input);
    await this.repository.save(item);
    await this.emit(itemCreated(item));
    return item;
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<InventoryItem> {
    return this.mutate(tenantId, id, (i) => renameInventoryItem(i, name));
  }

  async setCategory(tenantId: TenantId, id: Uuid, category: string | null): Promise<InventoryItem> {
    return this.mutate(tenantId, id, (i) => setItemCategory(i, category));
  }

  async setReorderLevel(
    tenantId: TenantId,
    id: Uuid,
    reorderLevel: number,
  ): Promise<InventoryItem> {
    return this.mutate(tenantId, id, (i) => setReorderLevel(i, reorderLevel));
  }

  async setStandardCost(
    tenantId: TenantId,
    id: Uuid,
    amountMinor: number | null,
    currency: string | null,
  ): Promise<InventoryItem> {
    return this.mutate(tenantId, id, (i) => setItemStandardCost(i, amountMinor, currency));
  }

  async discontinue(tenantId: TenantId, id: Uuid): Promise<InventoryItem> {
    const updated = discontinueItem(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(itemDiscontinued(updated));
    return updated;
  }

  async reactivate(tenantId: TenantId, id: Uuid): Promise<InventoryItem> {
    const updated = reactivateItem(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(itemReactivated(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<InventoryItem> {
    return this.require(tenantId, id);
  }

  async getBySku(tenantId: TenantId, sku: string): Promise<InventoryItem> {
    const item = await this.repository.findBySku(tenantId, sku);
    if (!item) {
      throw new InventoryItemNotFoundError(sku);
    }
    return item;
  }

  async list(tenantId: TenantId): Promise<InventoryItem[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<InventoryItem[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (item: InventoryItem) => InventoryItem,
  ): Promise<InventoryItem> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<InventoryItem> {
    const item = await this.repository.findById(tenantId, id);
    if (!item) {
      throw new InventoryItemNotFoundError(id);
    }
    return item;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
