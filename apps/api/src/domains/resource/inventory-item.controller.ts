import type { Principal } from "@knowget/auth";
import { type InventoryItem, InventoryItemService } from "@knowget/resource";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { PROCUREMENT_READ, PROCUREMENT_WRITE, parseBody, tenantOf } from "./resource-http";
import {
  createItemSchema,
  renameItemSchema,
  setItemCategorySchema,
  setReorderLevelSchema,
  setStandardCostSchema,
} from "./resource.dto";
import { RES_ITEM_SERVICE } from "./resource.tokens";

/** REST surface for inventory items (P2-D15). Gated by procurement:*; tenant-scoped. */
@Controller("procurement/items")
export class InventoryItemController {
  constructor(@Inject(RES_ITEM_SERVICE) private readonly service: InventoryItemService) {}

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<InventoryItem> {
    const dto = parseBody(createItemSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      sku: dto.sku,
      name: dto.name,
      unitOfMeasure: dto.unitOfMeasure,
      reorderLevel: dto.reorderLevel,
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.standardCostMinor !== undefined ? { standardCostMinor: dto.standardCostMinor } : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
    });
  }

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<InventoryItem> {
    const dto = parseBody(renameItemSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post(":id/category")
  @HttpCode(200)
  async setCategory(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<InventoryItem> {
    const dto = parseBody(setItemCategorySchema, body);
    return this.service.setCategory(tenantOf(principal), id as Uuid, dto.category);
  }

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post(":id/reorder-level")
  @HttpCode(200)
  async setReorderLevel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<InventoryItem> {
    const dto = parseBody(setReorderLevelSchema, body);
    return this.service.setReorderLevel(tenantOf(principal), id as Uuid, dto.reorderLevel);
  }

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post(":id/standard-cost")
  @HttpCode(200)
  async setStandardCost(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<InventoryItem> {
    const dto = parseBody(setStandardCostSchema, body);
    return this.service.setStandardCost(
      tenantOf(principal),
      id as Uuid,
      dto.amountMinor,
      dto.currency,
    );
  }

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post(":id/discontinue")
  @HttpCode(200)
  async discontinue(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<InventoryItem> {
    return this.service.discontinue(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(PROCUREMENT_WRITE)
  @Post(":id/reactivate")
  @HttpCode(200)
  async reactivate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<InventoryItem> {
    return this.service.reactivate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(PROCUREMENT_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<InventoryItem[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(PROCUREMENT_READ)
  @Get("by-sku/:sku")
  async getBySku(
    @CurrentPrincipal() principal: Principal,
    @Param("sku") sku: string,
  ): Promise<InventoryItem> {
    return this.service.getBySku(tenantOf(principal), sku);
  }

  @RequirePermissions(PROCUREMENT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<InventoryItem[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(PROCUREMENT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<InventoryItem> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
