import { type AcademicCalendar, AcademicCalendarService } from "@knowget/academic-structure";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ACADEMIC_READ, ACADEMIC_WRITE, parseBody, tenantOf } from "./academic-structure-http";
import { AS_CALENDAR_SERVICE } from "./academic-structure.tokens";
import {
  addExaminationPeriodSchema,
  addHolidaySchema,
  addSpecialEventSchema,
  addTermSchema,
  createCalendarSchema,
  setWorkingDaysSchema,
} from "./academic-structure.dto";

/** REST surface for academic calendars (P2-D06). Gated by academic:*; tenant-scoped. */
@Controller("academic-structure/calendars")
export class AcademicCalendarController {
  constructor(@Inject(AS_CALENDAR_SERVICE) private readonly service: AcademicCalendarService) {}

  @RequirePermissions(ACADEMIC_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<AcademicCalendar> {
    const dto = parseBody(createCalendarSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      academicYear: dto.academicYear,
      startDate: dto.startDate,
      endDate: dto.endDate,
    });
  }

  @RequirePermissions(ACADEMIC_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<AcademicCalendar[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(ACADEMIC_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<AcademicCalendar[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(ACADEMIC_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AcademicCalendar> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/terms")
  @HttpCode(201)
  async addTerm(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AcademicCalendar> {
    const dto = parseBody(addTermSchema, body);
    const { calendar } = await this.service.addTerm(tenantOf(principal), id as Uuid, dto);
    return calendar;
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/terms/:termId/remove")
  @HttpCode(200)
  async removeTerm(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("termId") termId: string,
  ): Promise<AcademicCalendar> {
    return this.service.removeTerm(tenantOf(principal), id as Uuid, termId as Uuid);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/holidays")
  @HttpCode(201)
  async addHoliday(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AcademicCalendar> {
    const dto = parseBody(addHolidaySchema, body);
    const { calendar } = await this.service.addHoliday(tenantOf(principal), id as Uuid, dto);
    return calendar;
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/holidays/:holidayId/remove")
  @HttpCode(200)
  async removeHoliday(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("holidayId") holidayId: string,
  ): Promise<AcademicCalendar> {
    return this.service.removeHoliday(tenantOf(principal), id as Uuid, holidayId as Uuid);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/examination-periods")
  @HttpCode(201)
  async addExaminationPeriod(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AcademicCalendar> {
    const dto = parseBody(addExaminationPeriodSchema, body);
    const { calendar } = await this.service.addExaminationPeriod(
      tenantOf(principal),
      id as Uuid,
      dto,
    );
    return calendar;
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/examination-periods/:periodId/remove")
  @HttpCode(200)
  async removeExaminationPeriod(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("periodId") periodId: string,
  ): Promise<AcademicCalendar> {
    return this.service.removeExaminationPeriod(tenantOf(principal), id as Uuid, periodId as Uuid);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/events")
  @HttpCode(201)
  async addSpecialEvent(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AcademicCalendar> {
    const dto = parseBody(addSpecialEventSchema, body);
    const { calendar } = await this.service.addSpecialEvent(tenantOf(principal), id as Uuid, dto);
    return calendar;
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/events/:eventId/remove")
  @HttpCode(200)
  async removeSpecialEvent(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("eventId") eventId: string,
  ): Promise<AcademicCalendar> {
    return this.service.removeSpecialEvent(tenantOf(principal), id as Uuid, eventId as Uuid);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/working-days")
  @HttpCode(200)
  async setWorkingDays(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AcademicCalendar> {
    const dto = parseBody(setWorkingDaysSchema, body);
    return this.service.setWorkingDays(tenantOf(principal), id as Uuid, dto.weekdays);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/publish")
  @HttpCode(200)
  async publish(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AcademicCalendar> {
    return this.service.publish(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AcademicCalendar> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }
}
