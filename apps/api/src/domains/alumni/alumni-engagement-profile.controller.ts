import type { Principal } from "@knowget/auth";
import {
  type AlumniEngagement,
  type AlumniEngagementProfile,
  AlumniEngagementProfileService,
  type EventParticipation,
} from "@knowget/alumni";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ALUMNI_READ, ALUMNI_WRITE, parseBody, tenantOf } from "./alumni-http";
import { refreshEngagementProfileSchema } from "./alumni.dto";
import { AL_ENGAGEMENT_PROFILE_SERVICE } from "./alumni.tokens";

/** REST surface for alumni engagement profiles (P2-D24). Gated by alumni:*; tenant-scoped. */
@Controller("alumni/engagement-profiles")
export class AlumniEngagementProfileController {
  constructor(
    @Inject(AL_ENGAGEMENT_PROFILE_SERVICE)
    private readonly service: AlumniEngagementProfileService,
  ) {}

  @RequirePermissions(ALUMNI_WRITE)
  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<AlumniEngagementProfile> {
    const dto = parseBody(refreshEngagementProfileSchema, body);
    return this.service.refreshForAlumnus(tenantOf(principal), dto.alumniProfileId as Uuid);
  }

  @RequirePermissions(ALUMNI_READ)
  @Get("by-alumnus/:alumniProfileId")
  async getForAlumnus(
    @CurrentPrincipal() principal: Principal,
    @Param("alumniProfileId") alumniProfileId: string,
  ): Promise<AlumniEngagementProfile | null> {
    return this.service.getForAlumnus(tenantOf(principal), alumniProfileId as Uuid);
  }

  @RequirePermissions(ALUMNI_READ)
  @Get("by-alumnus/:alumniProfileId/engagement")
  async engagementForAlumnus(
    @CurrentPrincipal() principal: Principal,
    @Param("alumniProfileId") alumniProfileId: string,
  ): Promise<AlumniEngagement> {
    return this.service.engagementForAlumnus(tenantOf(principal), alumniProfileId as Uuid);
  }

  @RequirePermissions(ALUMNI_READ)
  @Get("by-event/:eventId/participation")
  async eventParticipation(
    @CurrentPrincipal() principal: Principal,
    @Param("eventId") eventId: string,
  ): Promise<EventParticipation> {
    return this.service.eventParticipation(tenantOf(principal), eventId as Uuid);
  }
}
