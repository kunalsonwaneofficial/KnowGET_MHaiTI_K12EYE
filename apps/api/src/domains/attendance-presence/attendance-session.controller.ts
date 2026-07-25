import { type AttendanceSession, AttendanceSessionService } from "@knowget/attendance-presence";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ATTENDANCE_READ, ATTENDANCE_WRITE, parseBody, tenantOf } from "./attendance-presence-http";
import { createSessionSchema } from "./attendance-presence.dto";
import { AP_SESSION_SERVICE } from "./attendance-presence.tokens";

/** REST surface for attendance sessions (P2-D08). Gated by attendance:*; tenant-scoped. */
@Controller("attendance-presence/sessions")
export class AttendanceSessionController {
  constructor(@Inject(AP_SESSION_SERVICE) private readonly service: AttendanceSessionService) {}

  @RequirePermissions(ATTENDANCE_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<AttendanceSession> {
    const dto = parseBody(createSessionSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      sessionType: dto.sessionType,
      title: dto.title,
      date: dto.date,
      ...(dto.scheduleSlotId !== undefined ? { scheduleSlotId: dto.scheduleSlotId as Uuid } : {}),
      ...(dto.sectionId !== undefined ? { sectionId: dto.sectionId as Uuid } : {}),
      ...(dto.subjectId !== undefined ? { subjectId: dto.subjectId as Uuid } : {}),
      ...(dto.startsAt !== undefined ? { startsAt: dto.startsAt } : {}),
      ...(dto.endsAt !== undefined ? { endsAt: dto.endsAt } : {}),
    });
  }

  @RequirePermissions(ATTENDANCE_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<AttendanceSession[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(ATTENDANCE_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AttendanceSession> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ATTENDANCE_WRITE)
  @Post(":id/open")
  @HttpCode(200)
  async open(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AttendanceSession> {
    return this.service.open(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ATTENDANCE_WRITE)
  @Post(":id/close")
  @HttpCode(200)
  async close(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AttendanceSession> {
    return this.service.close(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ATTENDANCE_WRITE)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AttendanceSession> {
    return this.service.cancel(tenantOf(principal), id as Uuid);
  }
}
