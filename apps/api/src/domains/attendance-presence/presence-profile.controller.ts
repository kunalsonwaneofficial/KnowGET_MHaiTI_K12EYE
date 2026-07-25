import { type PresenceProfile, PresenceProfileService } from "@knowget/attendance-presence";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ATTENDANCE_READ, ATTENDANCE_WRITE, parseBody, tenantOf } from "./attendance-presence-http";
import { organizationScopeSchema } from "./attendance-presence.dto";
import { AP_PROFILE_SERVICE } from "./attendance-presence.tokens";

/**
 * REST surface for presence profiles (P2-D08) — the AI-ready read model of a participant's
 * presence signals. Materialisation happens through the analytics recompute; this surface
 * reads profiles and can pre-create an empty one. Gated by attendance:*; tenant-scoped.
 */
@Controller("attendance-presence/presence-profiles")
export class PresenceProfileController {
  constructor(@Inject(AP_PROFILE_SERVICE) private readonly service: PresenceProfileService) {}

  @RequirePermissions(ATTENDANCE_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<PresenceProfile[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(ATTENDANCE_READ)
  @Get("by-participant/:participantId")
  async getByParticipant(
    @CurrentPrincipal() principal: Principal,
    @Param("participantId") participantId: string,
  ): Promise<PresenceProfile | null> {
    return this.service.getByParticipant(tenantOf(principal), participantId as Uuid);
  }

  @RequirePermissions(ATTENDANCE_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<PresenceProfile> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ATTENDANCE_WRITE)
  @Post("by-participant/:participantId/ensure")
  @HttpCode(200)
  async ensure(
    @CurrentPrincipal() principal: Principal,
    @Param("participantId") participantId: string,
    @Body() body: unknown,
  ): Promise<PresenceProfile> {
    const dto = parseBody(organizationScopeSchema, body);
    return this.service.ensure(
      tenantOf(principal),
      dto.organizationId as Uuid,
      participantId as Uuid,
    );
  }
}
