import type { Principal } from "@knowget/auth";
import { type CollectionProfile, CollectionProfileService } from "@knowget/library";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { LIBRARY_READ, LIBRARY_WRITE, parseBody, tenantOf } from "./library-http";
import { refreshCollectionSchema } from "./library.dto";
import { LB_PROFILE_SERVICE } from "./library.tokens";

/**
 * REST surface for the collection profile (P2-D18) — the descriptive read model per organization, refreshed
 * from the pure engines. Gated by library:*; tenant-scoped.
 */
@Controller("library/collection-profiles")
export class CollectionProfileController {
  constructor(@Inject(LB_PROFILE_SERVICE) private readonly service: CollectionProfileService) {}

  @RequirePermissions(LIBRARY_WRITE)
  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<CollectionProfile> {
    const dto = parseBody(refreshCollectionSchema, body);
    return this.service.refresh(tenantOf(principal), dto.organizationId as Uuid, dto.asOfDate);
  }

  @RequirePermissions(LIBRARY_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<CollectionProfile[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(LIBRARY_READ)
  @Get("by-organization/:organizationId")
  async getForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<CollectionProfile | null> {
    return this.service.getForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(LIBRARY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<CollectionProfile> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
