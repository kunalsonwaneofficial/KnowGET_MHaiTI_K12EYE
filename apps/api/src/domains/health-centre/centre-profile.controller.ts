import type { Principal } from "@knowget/auth";
import {
  type CentreProfile,
  CentreProfileService,
  type ClinicalOccupancySummary,
} from "@knowget/health-centre";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { CLINIC_READ, CLINIC_WRITE, parseBody, tenantOf } from "./health-centre-http";
import { refreshProfileSchema } from "./health-centre.dto";
import { HC_PROFILE_SERVICE } from "./health-centre.tokens";

/**
 * REST surface for the health-centre profile (P2-D19) — the descriptive read model per centre, refreshed
 * from the pure engines. Gated by clinic:*; tenant-scoped.
 */
@Controller("clinic/centre-profiles")
export class CentreProfileController {
  constructor(@Inject(HC_PROFILE_SERVICE) private readonly service: CentreProfileService) {}

  @RequirePermissions(CLINIC_WRITE)
  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<CentreProfile> {
    const dto = parseBody(refreshProfileSchema, body);
    return this.service.refresh(tenantOf(principal), dto.centreId as Uuid, dto.asOfDate);
  }

  @RequirePermissions(CLINIC_READ)
  @Get("summary")
  async summary(@CurrentPrincipal() principal: Principal): Promise<ClinicalOccupancySummary> {
    return this.service.summarize(tenantOf(principal));
  }

  @RequirePermissions(CLINIC_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<CentreProfile[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(CLINIC_READ)
  @Get("by-centre/:centreId")
  async getForCentre(
    @CurrentPrincipal() principal: Principal,
    @Param("centreId") centreId: string,
  ): Promise<CentreProfile | null> {
    return this.service.getForCentre(tenantOf(principal), centreId as Uuid);
  }

  @RequirePermissions(CLINIC_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<CentreProfile> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
