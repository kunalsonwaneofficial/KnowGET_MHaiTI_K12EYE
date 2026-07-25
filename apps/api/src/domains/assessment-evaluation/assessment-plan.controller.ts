import {
  type AssessmentPlan,
  type PlannedAssessment,
  AssessmentPlanService,
} from "@knowget/assessment-evaluation";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  ASSESSMENT_READ,
  ASSESSMENT_WRITE,
  parseBody,
  tenantOf,
} from "./assessment-evaluation-http";
import {
  createPlanSchema,
  renameTitleSchema,
  setPlannedAssessmentsSchema,
} from "./assessment-evaluation.dto";
import { AE_PLAN_SERVICE } from "./assessment-evaluation.tokens";

/** REST surface for assessment plans (P2-D10). Gated by assessment:*; tenant-scoped. */
@Controller("assessment-evaluation/plans")
export class AssessmentPlanController {
  constructor(@Inject(AE_PLAN_SERVICE) private readonly service: AssessmentPlanService) {}

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<AssessmentPlan> {
    const dto = parseBody(createPlanSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      planType: dto.planType,
      title: dto.title,
      ...(dto.academicYear !== undefined ? { academicYear: dto.academicYear } : {}),
      ...(dto.term !== undefined ? { term: dto.term } : {}),
      ...(dto.subjectId !== undefined ? { subjectId: dto.subjectId as Uuid } : {}),
      ...(dto.gradeId !== undefined ? { gradeId: dto.gradeId as Uuid } : {}),
      ...(dto.plannedAssessments !== undefined
        ? { plannedAssessments: dto.plannedAssessments as PlannedAssessment[] }
        : {}),
    });
  }

  @RequirePermissions(ASSESSMENT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<AssessmentPlan[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(ASSESSMENT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AssessmentPlan> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AssessmentPlan> {
    const dto = parseBody(renameTitleSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.title);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/planned-assessments")
  @HttpCode(200)
  async setPlannedAssessments(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AssessmentPlan> {
    const dto = parseBody(setPlannedAssessmentsSchema, body);
    return this.service.setPlannedAssessments(
      tenantOf(principal),
      id as Uuid,
      dto.plannedAssessments as PlannedAssessment[],
    );
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/publish")
  @HttpCode(200)
  async publish(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AssessmentPlan> {
    return this.service.publish(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AssessmentPlan> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }
}
