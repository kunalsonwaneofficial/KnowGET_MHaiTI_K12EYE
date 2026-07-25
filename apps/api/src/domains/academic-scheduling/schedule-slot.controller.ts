import { type ScheduleSlot, ScheduleSlotService } from "@knowget/academic-scheduling";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { parseBody, SCHEDULING_READ, SCHEDULING_WRITE, tenantOf } from "./academic-scheduling-http";
import {
  assignSlotSchema,
  rescheduleSlotSchema,
  setSlotTeacherSchema,
  setSlotVenueSchema,
} from "./academic-scheduling.dto";
import { SCHED_SLOT_SERVICE } from "./academic-scheduling.tokens";

/** REST surface for schedule slots (P2-D07). Gated by scheduling:*; tenant-scoped. */
@Controller("academic-scheduling/slots")
export class ScheduleSlotController {
  constructor(@Inject(SCHED_SLOT_SERVICE) private readonly service: ScheduleSlotService) {}

  @RequirePermissions(SCHEDULING_WRITE)
  @Post()
  @HttpCode(201)
  async assign(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<ScheduleSlot> {
    const dto = parseBody(assignSlotSchema, body);
    return this.service.assign({
      tenantId: tenantOf(principal),
      timetableId: dto.timetableId as Uuid,
      dayOfWeek: dto.dayOfWeek,
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
      subjectId: dto.subjectId as Uuid,
      teacherId: dto.teacherId as Uuid,
      sectionId: dto.sectionId as Uuid,
      ...(dto.classId !== undefined ? { classId: dto.classId as Uuid } : {}),
      ...(dto.venueId !== undefined ? { venueId: dto.venueId as Uuid } : {}),
    });
  }

  @RequirePermissions(SCHEDULING_READ)
  @Get("by-timetable/:timetableId")
  async listForTimetable(
    @CurrentPrincipal() principal: Principal,
    @Param("timetableId") timetableId: string,
  ): Promise<ScheduleSlot[]> {
    return this.service.listForTimetable(tenantOf(principal), timetableId as Uuid);
  }

  @RequirePermissions(SCHEDULING_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ScheduleSlot> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SCHEDULING_WRITE)
  @Post(":id/teacher")
  @HttpCode(200)
  async setTeacher(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ScheduleSlot> {
    const dto = parseBody(setSlotTeacherSchema, body);
    return this.service.setTeacher(tenantOf(principal), id as Uuid, dto.teacherId as Uuid);
  }

  @RequirePermissions(SCHEDULING_WRITE)
  @Post(":id/venue")
  @HttpCode(200)
  async setVenue(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ScheduleSlot> {
    const dto = parseBody(setSlotVenueSchema, body);
    return this.service.setVenue(tenantOf(principal), id as Uuid, dto.venueId as Uuid | null);
  }

  @RequirePermissions(SCHEDULING_WRITE)
  @Post(":id/reschedule")
  @HttpCode(200)
  async reschedule(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ScheduleSlot> {
    const dto = parseBody(rescheduleSlotSchema, body);
    return this.service.reschedule(
      tenantOf(principal),
      id as Uuid,
      dto.dayOfWeek,
      dto.startsAt,
      dto.endsAt,
    );
  }

  @RequirePermissions(SCHEDULING_WRITE)
  @Post(":id/remove")
  @HttpCode(204)
  async remove(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<void> {
    await this.service.remove(tenantOf(principal), id as Uuid);
  }
}
