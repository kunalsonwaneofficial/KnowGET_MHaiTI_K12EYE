import type { Principal } from "@knowget/auth";
import { type IntelligenceProfile, IntelligenceProfileService } from "@knowget/student-lifecycle";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  createProfileSchema,
  recordInterventionSchema,
  updateIndicatorsSchema,
} from "./student-lifecycle.dto";
import { parseBody, STUDENT_READ, STUDENT_WRITE, tenantOf } from "./student-lifecycle-http";
import { STUDENT_INTELLIGENCE_SERVICE } from "./student-lifecycle.tokens";

/** REST surface for student intelligence profiles (P2-D03). Permission-gated; tenant-scoped. */
@Controller("student-lifecycle/intelligence")
export class IntelligenceProfileController {
  constructor(
    @Inject(STUDENT_INTELLIGENCE_SERVICE) private readonly service: IntelligenceProfileService,
  ) {}

  @RequirePermissions(STUDENT_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<IntelligenceProfile> {
    const dto = parseBody(createProfileSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      studentId: dto.studentId as Uuid,
    });
  }

  @RequirePermissions(STUDENT_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<IntelligenceProfile[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(STUDENT_READ)
  @Get("by-student/:studentId")
  async getForStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<IntelligenceProfile | null> {
    return this.service.getForStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(STUDENT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<IntelligenceProfile> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/indicators")
  @HttpCode(200)
  async updateIndicators(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<IntelligenceProfile> {
    const dto = parseBody(updateIndicatorsSchema, body);
    return this.service.updateIndicators(tenantOf(principal), id as Uuid, {
      ...(dto.academicRisk !== undefined ? { academicRisk: dto.academicRisk } : {}),
      ...(dto.academicTrajectory !== undefined
        ? { academicTrajectory: dto.academicTrajectory }
        : {}),
      ...(dto.attendanceTrend !== undefined ? { attendanceTrend: dto.attendanceTrend } : {}),
      ...(dto.behaviourTrend !== undefined ? { behaviourTrend: dto.behaviourTrend } : {}),
      ...(dto.engagement !== undefined ? { engagement: dto.engagement } : {}),
      ...(dto.wellbeing !== undefined ? { wellbeing: dto.wellbeing } : {}),
    });
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/interventions")
  @HttpCode(200)
  async recordIntervention(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<IntelligenceProfile> {
    const dto = parseBody(recordInterventionSchema, body);
    return this.service.recordIntervention(tenantOf(principal), id as Uuid, {
      kind: dto.kind,
      ...(dto.note !== undefined ? { note: dto.note } : {}),
      ...(dto.byId !== undefined ? { byId: dto.byId as Uuid } : {}),
      ...(dto.on !== undefined ? { on: dto.on } : {}),
    });
  }
}
