import type { Principal } from "@knowget/auth";
import { type UnitPlan, UnitPlanService } from "@knowget/teaching-learning";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  createUnitPlanSchema,
  renameSchema,
  setAssessmentStrategySchema,
  setEstimatedHoursSchema,
  stringListSchema,
  uuidListSchema,
} from "./teaching-learning.dto";
import { parseBody, TEACHING_READ, TEACHING_WRITE, tenantOf } from "./teaching-learning-http";
import { TL_UNIT_PLAN_SERVICE } from "./teaching-learning.tokens";

/** REST surface for unit plans (P2-D09). Gated by teaching:*; tenant-scoped. */
@Controller("teaching-learning/unit-plans")
export class UnitPlanController {
  constructor(@Inject(TL_UNIT_PLAN_SERVICE) private readonly service: UnitPlanService) {}

  @RequirePermissions(TEACHING_WRITE)
  @Post()
  @HttpCode(201)
  async create(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<UnitPlan> {
    const dto = parseBody(createUnitPlanSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      subjectId: dto.subjectId as Uuid,
      title: dto.title,
      ...(dto.academicPlanId !== undefined ? { academicPlanId: dto.academicPlanId as Uuid } : {}),
      ...(dto.sequence !== undefined ? { sequence: dto.sequence } : {}),
      ...(dto.curriculumFrameworkId !== undefined
        ? { curriculumFrameworkId: dto.curriculumFrameworkId as Uuid }
        : {}),
      ...(dto.learningOutcomeIds !== undefined
        ? { learningOutcomeIds: dto.learningOutcomeIds as Uuid[] }
        : {}),
      ...(dto.competencies !== undefined ? { competencies: dto.competencies } : {}),
      ...(dto.estimatedInstructionalHours !== undefined
        ? { estimatedInstructionalHours: dto.estimatedInstructionalHours }
        : {}),
      ...(dto.assessmentStrategy !== undefined
        ? { assessmentStrategy: dto.assessmentStrategy }
        : {}),
    });
  }

  @RequirePermissions(TEACHING_READ)
  @Get("by-subject/:subjectId")
  async listForSubject(
    @CurrentPrincipal() principal: Principal,
    @Param("subjectId") subjectId: string,
  ): Promise<UnitPlan[]> {
    return this.service.listForSubject(tenantOf(principal), subjectId as Uuid);
  }

  @RequirePermissions(TEACHING_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<UnitPlan[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(TEACHING_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<UnitPlan> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<UnitPlan> {
    const dto = parseBody(renameSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.title);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/outcomes")
  @HttpCode(200)
  async setOutcomes(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<UnitPlan> {
    const dto = parseBody(uuidListSchema, body);
    return this.service.setOutcomes(tenantOf(principal), id as Uuid, dto.ids as Uuid[]);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/competencies")
  @HttpCode(200)
  async setCompetencies(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<UnitPlan> {
    const dto = parseBody(stringListSchema, body);
    return this.service.setCompetencies(tenantOf(principal), id as Uuid, dto.items);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/estimated-hours")
  @HttpCode(200)
  async setEstimatedHours(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<UnitPlan> {
    const dto = parseBody(setEstimatedHoursSchema, body);
    return this.service.setEstimatedHours(tenantOf(principal), id as Uuid, dto.hours);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/assessment-strategy")
  @HttpCode(200)
  async setAssessmentStrategy(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<UnitPlan> {
    const dto = parseBody(setAssessmentStrategySchema, body);
    return this.service.setAssessmentStrategy(
      tenantOf(principal),
      id as Uuid,
      dto.assessmentStrategy,
    );
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<UnitPlan> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<UnitPlan> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }
}
