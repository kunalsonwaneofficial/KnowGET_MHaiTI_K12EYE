import type { Principal } from "@knowget/auth";
import { type EducationalJourney, EducationalJourneyService } from "@knowget/student-lifecycle";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { recordProgressionSchema, startJourneySchema } from "./student-lifecycle.dto";
import { parseBody, STUDENT_READ, STUDENT_WRITE, tenantOf } from "./student-lifecycle-http";
import { STUDENT_JOURNEY_SERVICE } from "./student-lifecycle.tokens";

/** REST surface for educational journeys (P2-D03). Permission-gated; tenant-scoped. */
@Controller("student-lifecycle/journeys")
export class EducationalJourneyController {
  constructor(
    @Inject(STUDENT_JOURNEY_SERVICE) private readonly service: EducationalJourneyService,
  ) {}

  @RequirePermissions(STUDENT_WRITE)
  @Post()
  @HttpCode(201)
  async start(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<EducationalJourney> {
    const dto = parseBody(startJourneySchema, body);
    return this.service.start({
      tenantId: tenantOf(principal),
      studentId: dto.studentId as Uuid,
    });
  }

  @RequirePermissions(STUDENT_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<EducationalJourney[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(STUDENT_READ)
  @Get("by-student/:studentId")
  async getForStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<EducationalJourney | null> {
    return this.service.getForStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(STUDENT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<EducationalJourney> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/progression")
  @HttpCode(200)
  async record(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EducationalJourney> {
    const dto = parseBody(recordProgressionSchema, body);
    return this.service.record(tenantOf(principal), id as Uuid, {
      type: dto.type,
      ...(dto.academicYear !== undefined ? { academicYear: dto.academicYear } : {}),
      ...(dto.fromGrade !== undefined ? { fromGrade: dto.fromGrade } : {}),
      ...(dto.toGrade !== undefined ? { toGrade: dto.toGrade } : {}),
      ...(dto.note !== undefined ? { note: dto.note } : {}),
      ...(dto.on !== undefined ? { on: dto.on } : {}),
    });
  }
}
