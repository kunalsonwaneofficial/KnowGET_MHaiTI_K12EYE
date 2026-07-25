import type { Principal } from "@knowget/auth";
import { type CoachingEngagement, CoachingEngagementService } from "@knowget/faculty-excellence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { endDateSchema, proposeEngagementSchema, setFocusSchema } from "./faculty-excellence.dto";
import { FACULTY_READ, FACULTY_WRITE, parseBody, tenantOf } from "./faculty-excellence-http";
import { FE_ENGAGEMENT_SERVICE } from "./faculty-excellence.tokens";

/** REST surface for coaching engagements (P2-D13). Gated by faculty:*; tenant-scoped. */
@Controller("faculty/coaching/engagements")
export class CoachingEngagementController {
  constructor(@Inject(FE_ENGAGEMENT_SERVICE) private readonly service: CoachingEngagementService) {}

  @RequirePermissions(FACULTY_WRITE)
  @Post()
  @HttpCode(201)
  async propose(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<CoachingEngagement> {
    const dto = parseBody(proposeEngagementSchema, body);
    return this.service.propose({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      coachId: dto.coachId as Uuid,
      coacheeId: dto.coacheeId as Uuid,
      focus: dto.focus,
      ...(dto.frameworkId !== undefined ? { frameworkId: dto.frameworkId as Uuid | null } : {}),
      ...(dto.startDate !== undefined ? { startDate: dto.startDate } : {}),
    });
  }

  @RequirePermissions(FACULTY_WRITE)
  @Post(":id/accept")
  @HttpCode(200)
  async accept(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<CoachingEngagement> {
    return this.service.accept(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FACULTY_WRITE)
  @Post(":id/complete")
  @HttpCode(200)
  async complete(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<CoachingEngagement> {
    const dto = parseBody(endDateSchema, body);
    return this.service.complete(tenantOf(principal), id as Uuid, dto.endDate ?? null);
  }

  @RequirePermissions(FACULTY_WRITE)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<CoachingEngagement> {
    const dto = parseBody(endDateSchema, body);
    return this.service.cancel(tenantOf(principal), id as Uuid, dto.endDate ?? null);
  }

  @RequirePermissions(FACULTY_WRITE)
  @Post(":id/focus")
  @HttpCode(200)
  async setFocus(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<CoachingEngagement> {
    const dto = parseBody(setFocusSchema, body);
    return this.service.setFocus(tenantOf(principal), id as Uuid, dto.focus);
  }

  @RequirePermissions(FACULTY_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<CoachingEngagement[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(FACULTY_READ)
  @Get("by-coachee/:coacheeId")
  async listForCoachee(
    @CurrentPrincipal() principal: Principal,
    @Param("coacheeId") coacheeId: string,
  ): Promise<CoachingEngagement[]> {
    return this.service.listForCoachee(tenantOf(principal), coacheeId as Uuid);
  }

  @RequirePermissions(FACULTY_READ)
  @Get("by-coach/:coachId")
  async listForCoach(
    @CurrentPrincipal() principal: Principal,
    @Param("coachId") coachId: string,
  ): Promise<CoachingEngagement[]> {
    return this.service.listForCoach(tenantOf(principal), coachId as Uuid);
  }

  @RequirePermissions(FACULTY_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<CoachingEngagement[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(FACULTY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<CoachingEngagement> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
