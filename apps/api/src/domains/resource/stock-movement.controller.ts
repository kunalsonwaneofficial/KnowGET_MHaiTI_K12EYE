import type { Principal } from "@knowget/auth";
import { type StockMovement, StockMovementService, type StockPosition } from "@knowget/resource";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { PROCUREMENT_READ, PROCUREMENT_WRITE, parseBody, tenantOf } from "./resource-http";
import { recordMovementSchema } from "./resource.dto";
import { RES_STOCK_MOVEMENT_SERVICE } from "./resource.tokens";

/**
 * REST surface for the stock ledger (P2-D15). Movements are append-only; an issue that would draw more
 * than is on hand is rejected by the pure stock-balance engine. Gated by procurement:*; tenant-scoped.
 */
@Controller("procurement/stock-movements")
export class StockMovementController {
  constructor(@Inject(RES_STOCK_MOVEMENT_SERVICE) private readonly service: StockMovementService) {}

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post()
  @HttpCode(201)
  async record(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<StockMovement> {
    const dto = parseBody(recordMovementSchema, body);
    return this.service.record({
      tenantId: tenantOf(principal),
      itemId: dto.itemId as Uuid,
      type: dto.type,
      quantity: dto.quantity,
      occurredAt: dto.occurredAt,
      ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
      ...(dto.reference !== undefined ? { reference: dto.reference } : {}),
    });
  }

  @RequirePermissions(PROCUREMENT_READ)
  @Get("by-item/:itemId")
  async listForItem(
    @CurrentPrincipal() principal: Principal,
    @Param("itemId") itemId: string,
  ): Promise<StockMovement[]> {
    return this.service.listForItem(tenantOf(principal), itemId as Uuid);
  }

  @RequirePermissions(PROCUREMENT_READ)
  @Get("by-item/:itemId/position")
  async positionForItem(
    @CurrentPrincipal() principal: Principal,
    @Param("itemId") itemId: string,
  ): Promise<StockPosition> {
    return this.service.positionForItem(tenantOf(principal), itemId as Uuid);
  }

  @RequirePermissions(PROCUREMENT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<StockMovement[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(PROCUREMENT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<StockMovement> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
