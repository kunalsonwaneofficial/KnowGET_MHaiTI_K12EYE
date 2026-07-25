import type { Principal } from "@knowget/auth";
import {
  type InventoryPosition,
  InventoryPositionService,
  type StockSummary,
} from "@knowget/resource";
import type { Uuid } from "@knowget/types";
import { Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { PROCUREMENT_READ, PROCUREMENT_WRITE, tenantOf } from "./resource-http";
import { RES_POSITION_SERVICE } from "./resource.tokens";

/**
 * REST surface for inventory positions (P2-D15) — the descriptive stock read model. A position is
 * always derived: `refresh` reconciles an item's movements through the pure engine and values them at
 * standard cost. Gated by procurement:*; tenant-scoped.
 */
@Controller("procurement/inventory-positions")
export class InventoryPositionController {
  constructor(@Inject(RES_POSITION_SERVICE) private readonly service: InventoryPositionService) {}

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post("refresh/:itemId")
  @HttpCode(200)
  async refresh(
    @CurrentPrincipal() principal: Principal,
    @Param("itemId") itemId: string,
  ): Promise<InventoryPosition> {
    return this.service.refresh(tenantOf(principal), itemId as Uuid);
  }

  @RequirePermissions(PROCUREMENT_READ)
  @Get("by-item/:itemId")
  async getForItem(
    @CurrentPrincipal() principal: Principal,
    @Param("itemId") itemId: string,
  ): Promise<InventoryPosition> {
    return this.service.getForItem(tenantOf(principal), itemId as Uuid);
  }

  @RequirePermissions(PROCUREMENT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<InventoryPosition[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(PROCUREMENT_READ)
  @Get("by-organization/:organizationId/summary")
  async stockSummaryFor(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<StockSummary> {
    return this.service.stockSummaryFor(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(PROCUREMENT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<InventoryPosition> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
