import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  InsufficientStockError,
  InventoryItemNotFoundError,
  StockMovementNotFoundError,
} from "./errors";
import type { InventoryItemRepository, StockMovementRepository } from "./ports";
import { stockMovementRecorded } from "./resource-events";
import type { StockPosition } from "./resource-view";
import { computeStockPosition } from "./stock-position";
import {
  type RecordStockMovementParams,
  recordStockMovement,
  type StockMovement,
} from "./stock-movement";

/** The service record input — the organization is derived from the item, not supplied. */
export type RecordStockMovementInput = Omit<RecordStockMovementParams, "organizationId">;

export interface StockMovementServiceDeps {
  readonly repository: StockMovementRepository;
  readonly items: InventoryItemRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for stock movements — the append-only stock ledger. Records a receipt, issue or
 * adjustment against an item (deriving the organization from the item), and **enforces the invariant
 * that an issue never draws more than is on hand** by running the pure stock-balance engine over the
 * item's prior movements before accepting the issue. Publishes the movement event.
 */
export class StockMovementService {
  private readonly repository: StockMovementRepository;
  private readonly items: InventoryItemRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: StockMovementServiceDeps) {
    this.repository = deps.repository;
    this.items = deps.items;
    this.events = deps.events;
  }

  async record(input: RecordStockMovementInput): Promise<StockMovement> {
    const item = await this.items.findById(input.tenantId, input.itemId);
    if (!item) {
      throw new InventoryItemNotFoundError(input.itemId);
    }
    if (input.type === "issue") {
      const movements = await this.repository.listByItem(input.tenantId, input.itemId);
      const position = computeStockPosition(input.itemId, item.reorderLevel, movements);
      if (input.quantity > position.onHandQuantity) {
        throw new InsufficientStockError(input.itemId, input.quantity, position.onHandQuantity);
      }
    }
    const movement = recordStockMovement({ ...input, organizationId: item.organizationId });
    await this.repository.save(movement);
    await this.emit(stockMovementRecorded(movement));
    return movement;
  }

  /** The item's current stock position, reconciled from its movements by the pure engine. */
  async positionForItem(tenantId: TenantId, itemId: Uuid): Promise<StockPosition> {
    const item = await this.items.findById(tenantId, itemId);
    if (!item) {
      throw new InventoryItemNotFoundError(itemId);
    }
    const movements = await this.repository.listByItem(tenantId, itemId);
    return computeStockPosition(itemId, item.reorderLevel, movements);
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<StockMovement> {
    const movement = await this.repository.findById(tenantId, id);
    if (!movement) {
      throw new StockMovementNotFoundError(id);
    }
    return movement;
  }

  async listForItem(tenantId: TenantId, itemId: Uuid): Promise<StockMovement[]> {
    return this.repository.listByItem(tenantId, itemId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<StockMovement[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
