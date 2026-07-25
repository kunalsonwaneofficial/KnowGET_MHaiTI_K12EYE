import type { Principal } from "@knowget/auth";
import { type Asset, AssetService, type DepreciationResult } from "@knowget/resource";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ASSET_READ, ASSET_WRITE, parseBody, tenantOf } from "./resource-http";
import {
  assignCustodianSchema,
  registerAssetSchema,
  renameAssetSchema,
  setAssetCategorySchema,
  setAssetLocationSchema,
} from "./resource.dto";
import { RES_ASSET_SERVICE } from "./resource.tokens";

/**
 * REST surface for the fixed-asset register (P2-D15). Depreciation (net book value) as of a date is
 * computed by the pure straight-line engine. Gated by asset:*; tenant-scoped.
 */
@Controller("assets")
export class AssetController {
  constructor(@Inject(RES_ASSET_SERVICE) private readonly service: AssetService) {}

  @RequirePermissions(ASSET_WRITE)
  @Post()
  @HttpCode(201)
  async register(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Asset> {
    const dto = parseBody(registerAssetSchema, body);
    return this.service.register({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      assetTag: dto.assetTag,
      name: dto.name,
      acquisitionCostMinor: dto.acquisitionCostMinor,
      salvageValueMinor: dto.salvageValueMinor,
      currency: dto.currency,
      acquisitionDate: dto.acquisitionDate,
      usefulLifeMonths: dto.usefulLifeMonths,
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.custodianId !== undefined ? { custodianId: dto.custodianId as Uuid } : {}),
      ...(dto.location !== undefined ? { location: dto.location } : {}),
    });
  }

  @RequirePermissions(ASSET_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Asset> {
    const dto = parseBody(renameAssetSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(ASSET_WRITE)
  @Post(":id/category")
  @HttpCode(200)
  async setCategory(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Asset> {
    const dto = parseBody(setAssetCategorySchema, body);
    return this.service.setCategory(tenantOf(principal), id as Uuid, dto.category);
  }

  @RequirePermissions(ASSET_WRITE)
  @Post(":id/location")
  @HttpCode(200)
  async setLocation(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Asset> {
    const dto = parseBody(setAssetLocationSchema, body);
    return this.service.setLocation(tenantOf(principal), id as Uuid, dto.location);
  }

  @RequirePermissions(ASSET_WRITE)
  @Post(":id/custodian")
  @HttpCode(200)
  async assignCustodian(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Asset> {
    const dto = parseBody(assignCustodianSchema, body);
    return this.service.assignCustodian(
      tenantOf(principal),
      id as Uuid,
      dto.custodianId as Uuid | null,
    );
  }

  @RequirePermissions(ASSET_WRITE)
  @Post(":id/send-to-maintenance")
  @HttpCode(200)
  async sendToMaintenance(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Asset> {
    return this.service.sendToMaintenance(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ASSET_WRITE)
  @Post(":id/return-from-maintenance")
  @HttpCode(200)
  async returnFromMaintenance(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Asset> {
    return this.service.returnFromMaintenance(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ASSET_WRITE)
  @Post(":id/retire")
  @HttpCode(200)
  async retire(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Asset> {
    return this.service.retire(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ASSET_WRITE)
  @Post(":id/dispose")
  @HttpCode(200)
  async dispose(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Asset> {
    return this.service.dispose(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ASSET_READ)
  @Get(":id/depreciation/:asOfDate")
  async depreciationAsOf(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("asOfDate") asOfDate: string,
  ): Promise<DepreciationResult> {
    return this.service.depreciationAsOf(tenantOf(principal), id as Uuid, asOfDate);
  }

  @RequirePermissions(ASSET_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Asset[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(ASSET_READ)
  @Get("by-tag/:assetTag")
  async getByTag(
    @CurrentPrincipal() principal: Principal,
    @Param("assetTag") assetTag: string,
  ): Promise<Asset> {
    return this.service.getByTag(tenantOf(principal), assetTag);
  }

  @RequirePermissions(ASSET_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Asset[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(ASSET_READ)
  @Get("by-custodian/:custodianId")
  async listForCustodian(
    @CurrentPrincipal() principal: Principal,
    @Param("custodianId") custodianId: string,
  ): Promise<Asset[]> {
    return this.service.listForCustodian(tenantOf(principal), custodianId as Uuid);
  }

  @RequirePermissions(ASSET_READ)
  @Get(":id")
  async getById(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Asset> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
