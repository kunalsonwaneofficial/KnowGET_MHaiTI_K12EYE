import { type Assessment, AssessmentService } from "@knowget/assessment-evaluation";
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
  createAssessmentSchema,
  renameTitleSchema,
  setMaximumMarksSchema,
  setRubricSchema,
  stringListSchema,
  uuidListSchema,
} from "./assessment-evaluation.dto";
import { AE_ASSESSMENT_SERVICE } from "./assessment-evaluation.tokens";

/** REST surface for assessments (P2-D10). Gated by assessment:*; tenant-scoped. */
@Controller("assessment-evaluation/assessments")
export class AssessmentController {
  constructor(@Inject(AE_ASSESSMENT_SERVICE) private readonly service: AssessmentService) {}

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Assessment> {
    const dto = parseBody(createAssessmentSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      subjectId: dto.subjectId as Uuid,
      assessmentType: dto.assessmentType,
      title: dto.title,
      ...(dto.frameworkId !== undefined ? { frameworkId: dto.frameworkId as Uuid } : {}),
      ...(dto.planId !== undefined ? { planId: dto.planId as Uuid } : {}),
      ...(dto.learningOutcomeIds !== undefined
        ? { learningOutcomeIds: dto.learningOutcomeIds as Uuid[] }
        : {}),
      ...(dto.competencies !== undefined ? { competencies: dto.competencies } : {}),
      ...(dto.maximumMarks !== undefined ? { maximumMarks: dto.maximumMarks } : {}),
      ...(dto.rubric !== undefined ? { rubric: dto.rubric } : {}),
      ...(dto.evaluationStrategy !== undefined
        ? { evaluationStrategy: dto.evaluationStrategy }
        : {}),
      ...(dto.deliveryMode !== undefined ? { deliveryMode: dto.deliveryMode } : {}),
    });
  }

  @RequirePermissions(ASSESSMENT_READ)
  @Get("by-subject/:subjectId")
  async listForSubject(
    @CurrentPrincipal() principal: Principal,
    @Param("subjectId") subjectId: string,
  ): Promise<Assessment[]> {
    return this.service.listForSubject(tenantOf(principal), subjectId as Uuid);
  }

  @RequirePermissions(ASSESSMENT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Assessment[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(ASSESSMENT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Assessment> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Assessment> {
    const dto = parseBody(renameTitleSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.title);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/outcomes")
  @HttpCode(200)
  async setOutcomes(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Assessment> {
    const dto = parseBody(uuidListSchema, body);
    return this.service.setOutcomes(tenantOf(principal), id as Uuid, dto.ids as Uuid[]);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/competencies")
  @HttpCode(200)
  async setCompetencies(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Assessment> {
    const dto = parseBody(stringListSchema, body);
    return this.service.setCompetencies(tenantOf(principal), id as Uuid, dto.items);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/maximum-marks")
  @HttpCode(200)
  async setMaximumMarks(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Assessment> {
    const dto = parseBody(setMaximumMarksSchema, body);
    return this.service.setMaximumMarks(tenantOf(principal), id as Uuid, dto.maximumMarks);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/rubric")
  @HttpCode(200)
  async setRubric(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Assessment> {
    const dto = parseBody(setRubricSchema, body);
    return this.service.setRubric(tenantOf(principal), id as Uuid, dto.rubric);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/publish")
  @HttpCode(200)
  async publish(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Assessment> {
    return this.service.publish(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/start")
  @HttpCode(200)
  async start(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Assessment> {
    return this.service.start(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/complete")
  @HttpCode(200)
  async complete(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Assessment> {
    return this.service.complete(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ASSESSMENT_WRITE)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Assessment> {
    return this.service.cancel(tenantOf(principal), id as Uuid);
  }
}
