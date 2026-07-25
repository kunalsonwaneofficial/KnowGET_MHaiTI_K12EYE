import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { InventoryItemNotFoundError, InventoryPositionNotFoundError } from "./errors";
import {
  createInventoryPosition,
  type InventoryPosition,
  positionMemberView,
  refreshInventoryPosition,
} from "./inventory-position";
import type {
  InventoryItemRepository,
  InventoryPositionRepository,
  StockMovementRepository,
} from "./ports";
import { positionRefreshed } from "./resource-events";
import type { StockSummary } from "./resource-view";
import { computeStockPosition, summarizeStock } from "./stock-position";

export interface InventoryPositionServiceDeps {
  readonly repository: InventoryPositionRepository;
  readonly items: InventoryItemRepository;
  readonly movements: StockMovementRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for inventory positions — the descriptive stock read model. `refresh` reconciles
 * an item's movements through the pure stock-balance engine, values the on-hand quantity at the item's
 * standard cost (when set), and upserts the position (creating it on first sight, refreshing and
 * version-bumping thereafter). `stockSummaryFor` rolls an organization's positions up through the pure
 * `summarizeStock`. The position is never a transaction; it is always derived.
 */
export class InventoryPositionService {
  private readonly repository: InventoryPositionRepository;
  private readonly items: InventoryItemRepository;
  private readonly movements: StockMovementRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: InventoryPositionServiceDeps) {
    this.repository = deps.repository;
    this.items = deps.items;
    this.movements = deps.movements;
    this.events = deps.events;
  }

  async refresh(tenantId: TenantId, itemId: Uuid): Promise<InventoryPosition> {
    const item = await this.items.findById(tenantId, itemId);
    if (!item) {
      throw new InventoryItemNotFoundError(itemId);
    }
    const movements = await this.movements.listByItem(tenantId, itemId);
    const stockPosition = computeStockPosition(itemId, item.reorderLevel, movements);
    const stockValueMinor =
      item.standardCostMinor === null
        ? null
        : stockPosition.onHandQuantity * item.standardCostMinor;
    const existing = await this.repository.findByItem(tenantId, itemId);
    const position = existing
      ? refreshInventoryPosition(existing, item.sku, stockPosition, stockValueMinor, item.currency)
      : createInventoryPosition({
          tenantId,
          organizationId: item.organizationId,
          itemId,
          sku: item.sku,
          position: stockPosition,
          stockValueMinor,
          currency: item.currency,
        });
    await this.repository.save(position);
    await this.emit(positionRefreshed(position));
    return position;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<InventoryPosition> {
    const position = await this.repository.findById(tenantId, id);
    if (!position) {
      throw new InventoryPositionNotFoundError(id);
    }
    return position;
  }

  async getForItem(tenantId: TenantId, itemId: Uuid): Promise<InventoryPosition> {
    const position = await this.repository.findByItem(tenantId, itemId);
    if (!position) {
      throw new InventoryPositionNotFoundError(itemId);
    }
    return position;
  }

  async listForOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<InventoryPosition[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  /** Roll an organization's item positions into a stock summary through the pure engine. */
  async stockSummaryFor(tenantId: TenantId, organizationId: Uuid): Promise<StockSummary> {
    const positions = await this.repository.listByOrganization(tenantId, organizationId);
    return summarizeStock(positions.map(positionMemberView));
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
