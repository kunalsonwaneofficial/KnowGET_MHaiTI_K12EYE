import type { Principal } from "@knowget/auth";
import { type CoachingSession, CoachingSessionService } from "@knowget/faculty-excellence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { amendSessionSchema, logSessionSchema } from "./faculty-excellence.dto";
import { FACULTY_READ, FACULTY_WRITE, parseBody, tenantOf } from "./faculty-excellence-http";
import { FE_SESSION_SERVICE } from "./faculty-excellence.tokens";

/** REST surface for coaching sessions (P2-D13). Gated by faculty:*; tenant-scoped. */
@Controller("faculty/coaching/sessions")
export class CoachingSessionController {
  constructor(@Inject(FE_SESSION_SERVICE) private readonly service: CoachingSessionService) {}

  @RequirePermissions(FACULTY_WRITE)
  @Post()
  @HttpCode(201)
  async log(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<CoachingSession> {
    const dto = parseBody(logSessionSchema, body);
    return this.service.log({
      tenantId: tenantOf(principal),
      engagementId: dto.engagementId as Uuid,
      ...(dto.sessionDate !== undefined ? { sessionDate: dto.sessionDate } : {}),
      ...(dto.focus !== undefined ? { focus: dto.focus } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      ...(dto.nextSteps !== undefined ? { nextSteps: dto.nextSteps } : {}),
    });
  }

  @RequirePermissions(FACULTY_WRITE)
  @Post(":id/amend")
  @HttpCode(200)
  async amend(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<CoachingSession> {
    const dto = parseBody(amendSessionSchema, body);
    return this.service.amend(tenantOf(principal), id as Uuid, {
      ...(dto.focus !== undefined ? { focus: dto.focus } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      ...(dto.nextSteps !== undefined ? { nextSteps: dto.nextSteps } : {}),
    });
  }

  @RequirePermissions(FACULTY_READ)
  @Get("by-engagement/:engagementId")
  async listForEngagement(
    @CurrentPrincipal() principal: Principal,
    @Param("engagementId") engagementId: string,
  ): Promise<CoachingSession[]> {
    return this.service.listForEngagement(tenantOf(principal), engagementId as Uuid);
  }

  @RequirePermissions(FACULTY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<CoachingSession> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
