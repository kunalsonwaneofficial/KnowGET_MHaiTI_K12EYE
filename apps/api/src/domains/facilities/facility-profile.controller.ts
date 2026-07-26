import type { Principal } from "@knowget/auth";
import {
  type CampusConditionSummary,
  type FacilityProfile,
  FacilityProfileService,
} from "@knowget/facilities";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { FACILITIES_READ, FACILITIES_WRITE, parseBody, tenantOf } from "./facilities-http";
import { refreshProfileSchema } from "./facilities.dto";
import { FAC_PROFILE_SERVICE } from "./facilities.tokens";

/** REST surface for facility profiles (P2-D20). Gated by facilities:*; tenant-scoped. */
@Controller("facilities/profiles")
export class FacilityProfileController {
  constructor(@Inject(FAC_PROFILE_SERVICE) private readonly service: FacilityProfileService) {}

  @RequirePermissions(FACILITIES_WRITE)
  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<FacilityProfile> {
    const dto = parseBody(refreshProfileSchema, body);
    return this.service.refresh(tenantOf(principal), dto.buildingId as Uuid, dto.refreshedAt);
  }

  @RequirePermissions(FACILITIES_READ)
  @Get("campus/:organizationId")
  async summarizeCampus(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<CampusConditionSummary> {
    return this.service.summarizeCampus(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(FACILITIES_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<FacilityProfile[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(FACILITIES_READ)
  @Get("by-building/:buildingId")
  async getForBuilding(
    @CurrentPrincipal() principal: Principal,
    @Param("buildingId") buildingId: string,
  ): Promise<FacilityProfile | null> {
    return this.service.getForBuilding(tenantOf(principal), buildingId as Uuid);
  }
}
