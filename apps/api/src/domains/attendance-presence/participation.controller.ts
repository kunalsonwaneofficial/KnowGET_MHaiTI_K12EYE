import { type Participation, ParticipationService } from "@knowget/attendance-presence";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ATTENDANCE_READ, ATTENDANCE_WRITE, parseBody, tenantOf } from "./attendance-presence-http";
import {
  amendRemarksSchema,
  recordParticipationSchema,
  setEngagementSchema,
} from "./attendance-presence.dto";
import { AP_PARTICIPATION_SERVICE } from "./attendance-presence.tokens";

/** REST surface for co-curricular participation (P2-D08). Gated by attendance:*; tenant-scoped. */
@Controller("attendance-presence/participation")
export class ParticipationController {
  constructor(@Inject(AP_PARTICIPATION_SERVICE) private readonly service: ParticipationService) {}

  @RequirePermissions(ATTENDANCE_WRITE)
  @Post()
  @HttpCode(201)
  async record(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Participation> {
    const dto = parseBody(recordParticipationSchema, body);
    return this.service.record({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      participantId: dto.participantId as Uuid,
      activityType: dto.activityType,
      activityName: dto.activityName,
      date: dto.date,
      ...(dto.sessionId !== undefined ? { sessionId: dto.sessionId as Uuid } : {}),
      ...(dto.role !== undefined ? { role: dto.role } : {}),
      ...(dto.engagementLevel !== undefined ? { engagementLevel: dto.engagementLevel } : {}),
      ...(dto.remarks !== undefined ? { remarks: dto.remarks } : {}),
    });
  }

  @RequirePermissions(ATTENDANCE_READ)
  @Get("by-participant/:participantId")
  async listForParticipant(
    @CurrentPrincipal() principal: Principal,
    @Param("participantId") participantId: string,
  ): Promise<Participation[]> {
    return this.service.listForParticipant(tenantOf(principal), participantId as Uuid);
  }

  @RequirePermissions(ATTENDANCE_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Participation[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(ATTENDANCE_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Participation> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ATTENDANCE_WRITE)
  @Post(":id/engagement")
  @HttpCode(200)
  async setEngagement(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Participation> {
    const dto = parseBody(setEngagementSchema, body);
    return this.service.setEngagement(tenantOf(principal), id as Uuid, dto.engagementLevel);
  }

  @RequirePermissions(ATTENDANCE_WRITE)
  @Post(":id/remarks")
  @HttpCode(200)
  async amendRemarks(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Participation> {
    const dto = parseBody(amendRemarksSchema, body);
    return this.service.amendRemarks(tenantOf(principal), id as Uuid, dto.remarks);
  }
}
