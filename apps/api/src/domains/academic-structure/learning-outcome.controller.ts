import { type LearningOutcome, LearningOutcomeService } from "@knowget/academic-structure";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ACADEMIC_READ, ACADEMIC_WRITE, parseBody, tenantOf } from "./academic-structure-http";
import {
  createLearningOutcomeSchema,
  setAssessmentAlignmentSchema,
  setBloomLevelSchema,
  setCompetenciesSchema,
  setCurriculumAlignmentSchema,
  setStatementSchema,
} from "./academic-structure.dto";
import { AS_LEARNING_OUTCOME_SERVICE } from "./academic-structure.tokens";

/** REST surface for learning outcomes (P2-D06). Gated by academic:*; tenant-scoped. */
@Controller("academic-structure/learning-outcomes")
export class LearningOutcomeController {
  constructor(
    @Inject(AS_LEARNING_OUTCOME_SERVICE) private readonly service: LearningOutcomeService,
  ) {}

  @RequirePermissions(ACADEMIC_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<LearningOutcome> {
    const dto = parseBody(createLearningOutcomeSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      subjectId: dto.subjectId as Uuid,
      code: dto.code,
      statement: dto.statement,
      ...(dto.bloomLevel !== undefined ? { bloomLevel: dto.bloomLevel } : {}),
      ...(dto.curriculumFrameworkId !== undefined
        ? { curriculumFrameworkId: dto.curriculumFrameworkId as Uuid | null }
        : {}),
    });
  }

  @RequirePermissions(ACADEMIC_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<LearningOutcome[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(ACADEMIC_READ)
  @Get("by-subject/:subjectId")
  async listForSubject(
    @CurrentPrincipal() principal: Principal,
    @Param("subjectId") subjectId: string,
  ): Promise<LearningOutcome[]> {
    return this.service.listForSubject(tenantOf(principal), subjectId as Uuid);
  }

  @RequirePermissions(ACADEMIC_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<LearningOutcome[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(ACADEMIC_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<LearningOutcome> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/statement")
  @HttpCode(200)
  async setStatement(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LearningOutcome> {
    const dto = parseBody(setStatementSchema, body);
    return this.service.setStatement(tenantOf(principal), id as Uuid, dto.statement);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/bloom-level")
  @HttpCode(200)
  async setBloomLevel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LearningOutcome> {
    const dto = parseBody(setBloomLevelSchema, body);
    return this.service.setBloomLevel(tenantOf(principal), id as Uuid, dto.bloomLevel);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/competencies")
  @HttpCode(200)
  async setCompetencies(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LearningOutcome> {
    const dto = parseBody(setCompetenciesSchema, body);
    return this.service.setCompetencies(tenantOf(principal), id as Uuid, dto.competencies);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/curriculum-alignment")
  @HttpCode(200)
  async setCurriculumAlignment(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LearningOutcome> {
    const dto = parseBody(setCurriculumAlignmentSchema, body);
    return this.service.setCurriculumAlignment(
      tenantOf(principal),
      id as Uuid,
      dto.curriculumFrameworkId as Uuid | null,
    );
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/assessment-alignment")
  @HttpCode(200)
  async setAssessmentAlignment(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LearningOutcome> {
    const dto = parseBody(setAssessmentAlignmentSchema, body);
    return this.service.setAssessmentAlignment(tenantOf(principal), id as Uuid, dto.methods);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<LearningOutcome> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<LearningOutcome> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }
}
