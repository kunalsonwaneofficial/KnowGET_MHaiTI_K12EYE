import type { Principal } from "@knowget/auth";
import {
  type SafetyProfile,
  SafetyProfileService,
  type SitePresenceSummary,
} from "@knowget/campus-security";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { parseBody, SECURITY_READ, SECURITY_WRITE, tenantOf } from "./campus-security-http";
import { refreshProfileSchema } from "./campus-security.dto";
import { CS_PROFILE_SERVICE } from "./campus-security.tokens";

/** REST surface for safety profiles (P2-D21). Gated by security:*; tenant-scoped. */
@Controller("security/profiles")
export class SafetyProfileController {
  constructor(@Inject(CS_PROFILE_SERVICE) private readonly service: SafetyProfileService) {}

  @RequirePermissions(SECURITY_WRITE)
  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<SafetyProfile> {
    const dto = parseBody(refreshProfileSchema, body);
    return this.service.refresh(tenantOf(principal), dto.zoneId as Uuid, dto.refreshedAt);
  }

  @RequirePermissions(SECURITY_READ)
  @Get("site/:organizationId")
  async summarizeSite(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<SitePresenceSummary> {
    return this.service.summarizeSite(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(SECURITY_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<SafetyProfile[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(SECURITY_READ)
  @Get("by-zone/:zoneId")
  async getForZone(
    @CurrentPrincipal() principal: Principal,
    @Param("zoneId") zoneId: string,
  ): Promise<SafetyProfile | null> {
    return this.service.getForZone(tenantOf(principal), zoneId as Uuid);
  }
}
