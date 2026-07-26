import type { Principal } from "@knowget/auth";
import { type EngagementProfile, EngagementProfileService } from "@knowget/engagement";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ENGAGEMENT_READ, ENGAGEMENT_WRITE, parseBody, tenantOf } from "./engagement-http";
import { refreshProfileSchema } from "./engagement.dto";
import { EN_PROFILE_SERVICE } from "./engagement.tokens";

/** REST surface for engagement profiles (P2-D22). Gated by engagement:*; tenant-scoped. */
@Controller("engagement/profiles")
export class EngagementProfileController {
  constructor(@Inject(EN_PROFILE_SERVICE) private readonly service: EngagementProfileService) {}

  @RequirePermissions(ENGAGEMENT_WRITE)
  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<EngagementProfile> {
    const dto = parseBody(refreshProfileSchema, body);
    return this.service.refresh(tenantOf(principal), dto.audienceId as Uuid, dto.refreshedAt);
  }

  @RequirePermissions(ENGAGEMENT_READ)
  @Get("by-audience/:audienceId")
  async getByAudience(
    @CurrentPrincipal() principal: Principal,
    @Param("audienceId") audienceId: string,
  ): Promise<EngagementProfile | null> {
    return this.service.getByAudience(tenantOf(principal), audienceId as Uuid);
  }

  @RequirePermissions(ENGAGEMENT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<EngagementProfile[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }
}
