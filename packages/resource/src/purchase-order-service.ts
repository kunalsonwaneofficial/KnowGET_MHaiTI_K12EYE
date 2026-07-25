import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateOrderNumberError,
  PurchaseOrderNotFoundError,
  SupplierNotActiveError,
  SupplierNotFoundError,
} from "./errors";
import type { OrderLineInput } from "./order-line";
import type { PurchaseOrderRepository, SupplierRepository } from "./ports";
import {
  addOrderLine,
  cancelPurchaseOrder,
  closePurchaseOrder,
  type DraftPurchaseOrderParams,
  draftPurchaseOrder,
  issuePurchaseOrder,
  type PurchaseOrder,
  receivePurchaseOrderLine,
  removeOrderLine,
} from "./purchase-order";
import {
  purchaseOrderCancelled,
  purchaseOrderClosed,
  purchaseOrderIssued,
  purchaseOrderReceived,
} from "./resource-events";
import { isSupplierActive } from "./supplier";
import type { StockMovementService } from "./stock-movement-service";

/** The service draft input — the organization is derived from the supplier, not supplied. */
export type DraftPurchaseOrderInput = Omit<DraftPurchaseOrderParams, "organizationId">;

export interface PurchaseOrderServiceDeps {
  readonly repository: PurchaseOrderRepository;
  readonly suppliers: SupplierRepository;
  readonly stockMovements: StockMovementService;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for purchase orders — orders to suppliers. Drafts an order against a supplier
 * (deriving the organization from it and enforcing a unique number), edits its lines while draft, and
 * drives `issued → partially_received | received → closed` (or `cancelled`). Issuing requires an
 * **active** supplier. **Receiving posts stock**: when a received line is linked to an inventory item,
 * a stock receipt is recorded through the stock service before the order is persisted, so the ledger
 * and the order never disagree. Publishes the order events.
 */
export class PurchaseOrderService {
  private readonly repository: PurchaseOrderRepository;
  private readonly suppliers: SupplierRepository;
  private readonly stockMovements: StockMovementService;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: PurchaseOrderServiceDeps) {
    this.repository = deps.repository;
    this.suppliers = deps.suppliers;
    this.stockMovements = deps.stockMovements;
    this.events = deps.events;
  }

  async draft(input: DraftPurchaseOrderInput): Promise<PurchaseOrder> {
    const supplier = await this.suppliers.findById(input.tenantId, input.supplierId);
    if (!supplier) {
      throw new SupplierNotFoundError(input.supplierId);
    }
    if (await this.repository.findByNumber(input.tenantId, input.number.trim())) {
      throw new DuplicateOrderNumberError(input.number.trim());
    }
    const order = draftPurchaseOrder({ ...input, organizationId: supplier.organizationId });
    await this.repository.save(order);
    return order;
  }

  async addLine(tenantId: TenantId, id: Uuid, input: OrderLineInput): Promise<PurchaseOrder> {
    return this.mutate(tenantId, id, (o) => addOrderLine(o, input));
  }

  async removeLine(tenantId: TenantId, id: Uuid, key: string): Promise<PurchaseOrder> {
    return this.mutate(tenantId, id, (o) => removeOrderLine(o, key));
  }

  async issue(tenantId: TenantId, id: Uuid): Promise<PurchaseOrder> {
    const order = await this.require(tenantId, id);
    const supplier = await this.suppliers.findById(tenantId, order.supplierId);
    if (!supplier) {
      throw new SupplierNotFoundError(order.supplierId);
    }
    if (!isSupplierActive(supplier)) {
      throw new SupplierNotActiveError(supplier.id, supplier.status);
    }
    const updated = issuePurchaseOrder(order);
    await this.repository.save(updated);
    await this.emit(purchaseOrderIssued(updated));
    return updated;
  }

  /**
   * Receive `quantity` against a line. Applies the receipt to the order (rejecting over-receipt), posts
   * a stock receipt when the line is item-linked (before persisting, so a stock-posting failure aborts
   * the receipt), then persists and — if the order is now fully received — publishes the received event.
   */
  async receive(
    tenantId: TenantId,
    id: Uuid,
    key: string,
    quantity: number,
    occurredAt: string,
  ): Promise<PurchaseOrder> {
    const order = await this.require(tenantId, id);
    const updated = receivePurchaseOrderLine(order, key, quantity);
    const line = updated.lines.find((l) => l.key === key);
    if (line?.itemId) {
      await this.stockMovements.record({
        tenantId,
        itemId: line.itemId,
        type: "receipt",
        quantity,
        occurredAt,
        reference: order.number,
        reason: "purchase-order receipt",
      });
    }
    await this.repository.save(updated);
    if (updated.status === "received") {
      await this.emit(purchaseOrderReceived(updated));
    }
    return updated;
  }

  async close(tenantId: TenantId, id: Uuid): Promise<PurchaseOrder> {
    const updated = closePurchaseOrder(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(purchaseOrderClosed(updated));
    return updated;
  }

  async cancel(tenantId: TenantId, id: Uuid): Promise<PurchaseOrder> {
    const updated = cancelPurchaseOrder(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(purchaseOrderCancelled(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<PurchaseOrder> {
    return this.require(tenantId, id);
  }

  async getByNumber(tenantId: TenantId, number: string): Promise<PurchaseOrder> {
    const order = await this.repository.findByNumber(tenantId, number);
    if (!order) {
      throw new PurchaseOrderNotFoundError(number);
    }
    return order;
  }

  async listForSupplier(tenantId: TenantId, supplierId: Uuid): Promise<PurchaseOrder[]> {
    return this.repository.listBySupplier(tenantId, supplierId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<PurchaseOrder[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  async list(tenantId: TenantId): Promise<PurchaseOrder[]> {
    return this.repository.listByTenant(tenantId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (order: PurchaseOrder) => PurchaseOrder,
  ): Promise<PurchaseOrder> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<PurchaseOrder> {
    const order = await this.repository.findById(tenantId, id);
    if (!order) {
      throw new PurchaseOrderNotFoundError(id);
    }
    return order;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
