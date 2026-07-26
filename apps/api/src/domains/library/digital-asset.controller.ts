import type { Principal } from "@knowget/auth";
import { type DigitalAsset, DigitalAssetService } from "@knowget/library";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { LIBRARY_READ, LIBRARY_WRITE, parseBody, tenantOf } from "./library-http";
import {
  catalogDigitalAssetSchema,
  renameDigitalAssetSchema,
  renewLicenseSchema,
  setDigitalAccessSchema,
} from "./library.dto";
import { LB_DIGITAL_ASSET_SERVICE } from "./library.tokens";

/** REST surface for digital learning assets (P2-D18). Gated by library:*; tenant-scoped. */
@Controller("library/digital-assets")
export class DigitalAssetController {
  constructor(@Inject(LB_DIGITAL_ASSET_SERVICE) private readonly service: DigitalAssetService) {}

  @RequirePermissions(LIBRARY_WRITE)
  @Post()
  @HttpCode(201)
  async catalog(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<DigitalAsset> {
    const dto = parseBody(catalogDigitalAssetSchema, body);
    return this.service.catalog({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      title: dto.title,
      format: dto.format,
      accessModel: dto.accessModel,
      accessUrl: dto.accessUrl,
      provider: dto.provider,
      licenseExpiry: dto.licenseExpiry,
    });
  }

  @RequirePermissions(LIBRARY_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<DigitalAsset> {
    const dto = parseBody(renameDigitalAssetSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.title);
  }

  @RequirePermissions(LIBRARY_WRITE)
  @Post(":id/access")
  @HttpCode(200)
  async setAccess(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<DigitalAsset> {
    const dto = parseBody(setDigitalAccessSchema, body);
    return this.service.setAccess(
      tenantOf(principal),
      id as Uuid,
      dto.accessModel,
      dto.accessUrl,
      dto.provider,
    );
  }

  @RequirePermissions(LIBRARY_WRITE)
  @Post(":id/renew-license")
  @HttpCode(200)
  async renewLicense(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<DigitalAsset> {
    const dto = parseBody(renewLicenseSchema, body);
    return this.service.renewLicense(tenantOf(principal), id as Uuid, dto.licenseExpiry);
  }

  @RequirePermissions(LIBRARY_WRITE)
  @Post(":id/retire")
  @HttpCode(200)
  async retire(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<DigitalAsset> {
    return this.service.retire(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(LIBRARY_WRITE)
  @Post(":id/reactivate")
  @HttpCode(200)
  async reactivate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<DigitalAsset> {
    return this.service.reactivate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(LIBRARY_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<DigitalAsset[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(LIBRARY_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<DigitalAsset[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(LIBRARY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<DigitalAsset> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
