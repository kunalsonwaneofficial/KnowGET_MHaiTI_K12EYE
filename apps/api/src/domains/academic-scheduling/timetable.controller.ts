import {
  type DetectedConflict,
  type SchedulingIntelligence,
  type TeacherWorkload,
  type Timetable,
  TimetableService,
} from "@knowget/academic-scheduling";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { parseBody, SCHEDULING_READ, SCHEDULING_WRITE, tenantOf } from "./academic-scheduling-http";
import { createTimetableSchema, noteSchema, renameSchema } from "./academic-scheduling.dto";
import { SCHED_TIMETABLE_SERVICE } from "./academic-scheduling.tokens";

/** REST surface for timetables (P2-D07). Gated by scheduling:*; tenant-scoped. */
@Controller("academic-scheduling/timetables")
export class TimetableController {
  constructor(@Inject(SCHED_TIMETABLE_SERVICE) private readonly service: TimetableService) {}

  @RequirePermissions(SCHEDULING_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Timetable> {
    const dto = parseBody(createTimetableSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      code: dto.code,
      name: dto.name,
      academicYear: dto.academicYear,
      gradeId: dto.gradeId as Uuid,
      ...(dto.term !== undefined ? { term: dto.term } : {}),
      ...(dto.classId !== undefined ? { classId: dto.classId as Uuid } : {}),
      ...(dto.sectionId !== undefined ? { sectionId: dto.sectionId as Uuid } : {}),
    });
  }

  @RequirePermissions(SCHEDULING_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Timetable[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(SCHEDULING_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Timetable[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(SCHEDULING_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Timetable> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SCHEDULING_READ)
  @Get(":id/conflicts")
  async conflicts(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<DetectedConflict[]> {
    return this.service.validate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SCHEDULING_READ)
  @Get(":id/intelligence")
  async intelligence(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<SchedulingIntelligence> {
    return this.service.intelligence(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SCHEDULING_READ)
  @Get(":id/workload/:teacherId")
  async workload(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("teacherId") teacherId: string,
  ): Promise<TeacherWorkload> {
    return this.service.teacherWorkload(tenantOf(principal), id as Uuid, teacherId as Uuid);
  }

  @RequirePermissions(SCHEDULING_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Timetable> {
    const dto = parseBody(renameSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(SCHEDULING_WRITE)
  @Post(":id/publish")
  @HttpCode(200)
  async publish(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Timetable> {
    return this.service.publish(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SCHEDULING_WRITE)
  @Post(":id/revise")
  @HttpCode(200)
  async revise(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Timetable> {
    const dto = parseBody(noteSchema, body);
    return this.service.revise(tenantOf(principal), id as Uuid, dto.note);
  }

  @RequirePermissions(SCHEDULING_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Timetable> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }
}
