import { type CurriculumFramework, CurriculumFrameworkService } from "@knowget/academic-structure";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ACADEMIC_READ, ACADEMIC_WRITE, parseBody, tenantOf } from "./academic-structure-http";
import {
  createCurriculumSchema,
  reviseCurriculumSchema,
  setPhilosophySchema,
  setSubjectFrameworkSchema,
} from "./academic-structure.dto";
import { AS_CURRICULUM_SERVICE } from "./academic-structure.tokens";

/** REST surface for curriculum frameworks (P2-D06). Gated by academic:*; tenant-scoped. */
@Controller("academic-structure/curricula")
export class CurriculumFrameworkController {
  constructor(
    @Inject(AS_CURRICULUM_SERVICE) private readonly service: CurriculumFrameworkService,
  ) {}

  @RequirePermissions(ACADEMIC_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<CurriculumFramework> {
    const dto = parseBody(createCurriculumSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      name: dto.name,
      code: dto.code,
      board: dto.board,
      ...(dto.learningPhilosophy !== undefined
        ? { learningPhilosophy: dto.learningPhilosophy }
        : {}),
      ...(dto.competencyModel !== undefined ? { competencyModel: dto.competencyModel } : {}),
      ...(dto.assessmentPhilosophy !== undefined
        ? { assessmentPhilosophy: dto.assessmentPhilosophy }
        : {}),
      ...(dto.subjectFramework !== undefined ? { subjectFramework: dto.subjectFramework } : {}),
    });
  }

  @RequirePermissions(ACADEMIC_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<CurriculumFramework[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(ACADEMIC_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<CurriculumFramework[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(ACADEMIC_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<CurriculumFramework> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/learning-philosophy")
  @HttpCode(200)
  async setLearningPhilosophy(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<CurriculumFramework> {
    const dto = parseBody(setPhilosophySchema, body);
    return this.service.setLearningPhilosophy(tenantOf(principal), id as Uuid, dto.value);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/competency-model")
  @HttpCode(200)
  async setCompetencyModel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<CurriculumFramework> {
    const dto = parseBody(setPhilosophySchema, body);
    return this.service.setCompetencyModel(tenantOf(principal), id as Uuid, dto.value);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/assessment-philosophy")
  @HttpCode(200)
  async setAssessmentPhilosophy(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<CurriculumFramework> {
    const dto = parseBody(setPhilosophySchema, body);
    return this.service.setAssessmentPhilosophy(tenantOf(principal), id as Uuid, dto.value);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/subject-framework")
  @HttpCode(200)
  async setSubjectFramework(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<CurriculumFramework> {
    const dto = parseBody(setSubjectFrameworkSchema, body);
    return this.service.setSubjectFramework(tenantOf(principal), id as Uuid, dto.subjects);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<CurriculumFramework> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/revise")
  @HttpCode(200)
  async revise(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<CurriculumFramework> {
    const dto = parseBody(reviseCurriculumSchema, body);
    return this.service.revise(tenantOf(principal), id as Uuid, dto.note);
  }

  @RequirePermissions(ACADEMIC_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<CurriculumFramework> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }
}
