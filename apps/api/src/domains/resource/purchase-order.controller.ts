import type { Principal } from "@knowget/auth";
import { type OrderLineInput, type PurchaseOrder, PurchaseOrderService } from "@knowget/resource";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { PROCUREMENT_READ, PROCUREMENT_WRITE, parseBody, tenantOf } from "./resource-http";
import { addOrderLineSchema, draftOrderSchema, receiveOrderSchema } from "./resource.dto";
import { RES_ORDER_SERVICE } from "./resource.tokens";

/** An order-line input with only its defined optional fields (avoids explicit-undefined). */
function toOrderLineInput(l: {
  key: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  itemId?: string;
}): OrderLineInput {
  return {
    key: l.key,
    description: l.description,
    quantity: l.quantity,
    unitPriceMinor: l.unitPriceMinor,
    ...(l.itemId !== undefined ? { itemId: l.itemId as Uuid } : {}),
  };
}

/**
 * REST surface for purchase orders (P2-D15). Issuing requires an active supplier; receiving an
 * item-linked line posts a stock receipt through the ledger before the order is persisted. Gated by
 * procurement:*; tenant-scoped.
 */
@Controller("procurement/orders")
export class PurchaseOrderController {
  constructor(@Inject(RES_ORDER_SERVICE) private readonly service: PurchaseOrderService) {}

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post()
  @HttpCode(201)
  async draft(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<PurchaseOrder> {
    const dto = parseBody(draftOrderSchema, body);
    return this.service.draft({
      tenantId: tenantOf(principal),
      supplierId: dto.supplierId as Uuid,
      number: dto.number,
      currency: dto.currency,
      ...(dto.requisitionId !== undefined ? { requisitionId: dto.requisitionId as Uuid } : {}),
      ...(dto.expectedDate !== undefined ? { expectedDate: dto.expectedDate } : {}),
      ...(dto.lines !== undefined ? { lines: dto.lines.map(toOrderLineInput) } : {}),
    });
  }

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post(":id/lines")
  @HttpCode(200)
  async addLine(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<PurchaseOrder> {
    const dto = parseBody(addOrderLineSchema, body);
    return this.service.addLine(tenantOf(principal), id as Uuid, toOrderLineInput(dto));
  }

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post(":id/lines/:key/remove")
  @HttpCode(200)
  async removeLine(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("key") key: string,
  ): Promise<PurchaseOrder> {
    return this.service.removeLine(tenantOf(principal), id as Uuid, key);
  }

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post(":id/issue")
  @HttpCode(200)
  async issue(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<PurchaseOrder> {
    return this.service.issue(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post(":id/receive")
  @HttpCode(200)
  async receive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<PurchaseOrder> {
    const dto = parseBody(receiveOrderSchema, body);
    return this.service.receive(
      tenantOf(principal),
      id as Uuid,
      dto.key,
      dto.quantity,
      dto.occurredAt,
    );
  }

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post(":id/close")
  @HttpCode(200)
  async close(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<PurchaseOrder> {
    return this.service.close(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<PurchaseOrder> {
    return this.service.cancel(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(PROCUREMENT_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<PurchaseOrder[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(PROCUREMENT_READ)
  @Get("by-number/:number")
  async getByNumber(
    @CurrentPrincipal() principal: Principal,
    @Param("number") number: string,
  ): Promise<PurchaseOrder> {
    return this.service.getByNumber(tenantOf(principal), number);
  }

  @RequirePermissions(PROCUREMENT_READ)
  @Get("by-supplier/:supplierId")
  async listForSupplier(
    @CurrentPrincipal() principal: Principal,
    @Param("supplierId") supplierId: string,
  ): Promise<PurchaseOrder[]> {
    return this.service.listForSupplier(tenantOf(principal), supplierId as Uuid);
  }

  @RequirePermissions(PROCUREMENT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<PurchaseOrder[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(PROCUREMENT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<PurchaseOrder> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
