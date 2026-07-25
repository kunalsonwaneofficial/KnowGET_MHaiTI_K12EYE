import type { Principal } from "@knowget/auth";
import { type AcademicPlan, AcademicPlanService } from "@knowget/teaching-learning";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  createAcademicPlanSchema,
  renameSchema,
  setObjectivesSchema,
  setPeriodSchema,
} from "./teaching-learning.dto";
import { parseBody, TEACHING_READ, TEACHING_WRITE, tenantOf } from "./teaching-learning-http";
import { TL_ACADEMIC_PLAN_SERVICE } from "./teaching-learning.tokens";

/** REST surface for academic plans (P2-D09). Gated by teaching:*; tenant-scoped. */
@Controller("teaching-learning/academic-plans")
export class AcademicPlanController {
  constructor(@Inject(TL_ACADEMIC_PLAN_SERVICE) private readonly service: AcademicPlanService) {}

  @RequirePermissions(TEACHING_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<AcademicPlan> {
    const dto = parseBody(createAcademicPlanSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      planType: dto.planType,
      code: dto.code,
      title: dto.title,
      ...(dto.academicYear !== undefined ? { academicYear: dto.academicYear } : {}),
      ...(dto.term !== undefined ? { term: dto.term } : {}),
      ...(dto.subjectId !== undefined ? { subjectId: dto.subjectId as Uuid } : {}),
      ...(dto.objectives !== undefined ? { objectives: dto.objectives } : {}),
      ...(dto.fromDate !== undefined ? { fromDate: dto.fromDate } : {}),
      ...(dto.toDate !== undefined ? { toDate: dto.toDate } : {}),
    });
  }

  @RequirePermissions(TEACHING_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<AcademicPlan[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(TEACHING_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AcademicPlan> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AcademicPlan> {
    const dto = parseBody(renameSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.title);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/objectives")
  @HttpCode(200)
  async setObjectives(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AcademicPlan> {
    const dto = parseBody(setObjectivesSchema, body);
    return this.service.setObjectives(tenantOf(principal), id as Uuid, dto.objectives);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/period")
  @HttpCode(200)
  async setPeriod(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AcademicPlan> {
    const dto = parseBody(setPeriodSchema, body);
    return this.service.setPeriod(tenantOf(principal), id as Uuid, dto.fromDate, dto.toDate);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/publish")
  @HttpCode(200)
  async publish(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AcademicPlan> {
    return this.service.publish(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AcademicPlan> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }
}
