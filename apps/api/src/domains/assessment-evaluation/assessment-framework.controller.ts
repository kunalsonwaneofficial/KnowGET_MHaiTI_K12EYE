import {
  type AssessmentFramework,
  AssessmentFrameworkService,
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
  createFrameworkSchema,
  noteSchema,
  renameNameSchema,
  setCompetencyModelSchema,
  setGradeBandsSchema,
  setPromotionCriteriaSchema,
  setWeightageRulesSchema,
} from "./assessment-evaluation.dto";
import { AE_FRAMEWORK_SERVICE } from "./assessment-evaluation.tokens";

/** REST surface for assessment frameworks (P2-D10). Gated by assessment:*; tenant-scoped. */
@Controller("assessment-evaluation/frameworks")
export class AssessmentFrameworkController {
  constructor(@Inject(AE_FRAMEWORK_SERVICE) private readonly service: AssessmentFrameworkService) {}

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<AssessmentFramework> {
    const dto = parseBody(createFrameworkSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      code: dto.code,
      name: dto.name,
      assessmentModel: dto.assessmentModel,
      ...(dto.weightageRules !== undefined ? { weightageRules: dto.weightageRules } : {}),
      ...(dto.gradeBands !== undefined ? { gradeBands: dto.gradeBands } : {}),
      ...(dto.competencyModel !== undefined ? { competencyModel: dto.competencyModel } : {}),
      ...(dto.promotionCriteria !== undefined ? { promotionCriteria: dto.promotionCriteria } : {}),
    });
  }

  @RequirePermissions(ASSESSMENT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<AssessmentFramework[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(ASSESSMENT_READ)
  @Get("by-code/:organizationId/:code")
  async getByCode(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
    @Param("code") code: string,
  ): Promise<AssessmentFramework | null> {
    return this.service.getByCode(tenantOf(principal), organizationId as Uuid, code);
  }

  @RequirePermissions(ASSESSMENT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AssessmentFramework> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AssessmentFramework> {
    const dto = parseBody(renameNameSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/weightage-rules")
  @HttpCode(200)
  async setWeightageRules(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AssessmentFramework> {
    const dto = parseBody(setWeightageRulesSchema, body);
    return this.service.setWeightageRules(tenantOf(principal), id as Uuid, dto.weightageRules);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/grade-bands")
  @HttpCode(200)
  async setGradeBands(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AssessmentFramework> {
    const dto = parseBody(setGradeBandsSchema, body);
    return this.service.setGradeBands(tenantOf(principal), id as Uuid, dto.gradeBands);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/competency-model")
  @HttpCode(200)
  async setCompetencyModel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AssessmentFramework> {
    const dto = parseBody(setCompetencyModelSchema, body);
    return this.service.setCompetencyModel(tenantOf(principal), id as Uuid, dto.competencyModel);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/promotion-criteria")
  @HttpCode(200)
  async setPromotionCriteria(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AssessmentFramework> {
    const dto = parseBody(setPromotionCriteriaSchema, body);
    return this.service.setPromotionCriteria(
      tenantOf(principal),
      id as Uuid,
      dto.promotionCriteria,
    );
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AssessmentFramework> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/revise")
  @HttpCode(200)
  async revise(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AssessmentFramework> {
    const dto = parseBody(noteSchema, body);
    return this.service.revise(tenantOf(principal), id as Uuid, dto.note);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AssessmentFramework> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }
}
