import type { Principal } from "@knowget/auth";
import { type LessonPlan, LessonPlanService } from "@knowget/teaching-learning";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  createLessonPlanSchema,
  noteSchema,
  renameSchema,
  setObjectivesSchema,
  setReflectionNotesSchema,
  stringListSchema,
  uuidListSchema,
} from "./teaching-learning.dto";
import { parseBody, TEACHING_READ, TEACHING_WRITE, tenantOf } from "./teaching-learning-http";
import { TL_LESSON_PLAN_SERVICE } from "./teaching-learning.tokens";

/** REST surface for lesson plans (P2-D09). Gated by teaching:*; tenant-scoped. */
@Controller("teaching-learning/lesson-plans")
export class LessonPlanController {
  constructor(@Inject(TL_LESSON_PLAN_SERVICE) private readonly service: LessonPlanService) {}

  @RequirePermissions(TEACHING_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<LessonPlan> {
    const dto = parseBody(createLessonPlanSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      subjectId: dto.subjectId as Uuid,
      title: dto.title,
      ...(dto.unitPlanId !== undefined ? { unitPlanId: dto.unitPlanId as Uuid } : {}),
      ...(dto.objectives !== undefined ? { objectives: dto.objectives } : {}),
      ...(dto.learningOutcomeIds !== undefined
        ? { learningOutcomeIds: dto.learningOutcomeIds as Uuid[] }
        : {}),
      ...(dto.teachingStrategies !== undefined
        ? { teachingStrategies: dto.teachingStrategies }
        : {}),
      ...(dto.learningActivities !== undefined
        ? { learningActivities: dto.learningActivities }
        : {}),
      ...(dto.assessmentCheckpoints !== undefined
        ? { assessmentCheckpoints: dto.assessmentCheckpoints }
        : {}),
      ...(dto.requiredResourceIds !== undefined
        ? { requiredResourceIds: dto.requiredResourceIds as Uuid[] }
        : {}),
      ...(dto.differentiationStrategies !== undefined
        ? { differentiationStrategies: dto.differentiationStrategies }
        : {}),
      ...(dto.reflectionNotes !== undefined ? { reflectionNotes: dto.reflectionNotes } : {}),
    });
  }

  @RequirePermissions(TEACHING_READ)
  @Get("by-subject/:subjectId")
  async listForSubject(
    @CurrentPrincipal() principal: Principal,
    @Param("subjectId") subjectId: string,
  ): Promise<LessonPlan[]> {
    return this.service.listForSubject(tenantOf(principal), subjectId as Uuid);
  }

  @RequirePermissions(TEACHING_READ)
  @Get("by-unit/:unitPlanId")
  async listForUnit(
    @CurrentPrincipal() principal: Principal,
    @Param("unitPlanId") unitPlanId: string,
  ): Promise<LessonPlan[]> {
    return this.service.listForUnit(tenantOf(principal), unitPlanId as Uuid);
  }

  @RequirePermissions(TEACHING_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<LessonPlan[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(TEACHING_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<LessonPlan> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LessonPlan> {
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
  ): Promise<LessonPlan> {
    const dto = parseBody(setObjectivesSchema, body);
    return this.service.setObjectives(tenantOf(principal), id as Uuid, dto.objectives);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/outcomes")
  @HttpCode(200)
  async setOutcomes(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LessonPlan> {
    const dto = parseBody(uuidListSchema, body);
    return this.service.setOutcomes(tenantOf(principal), id as Uuid, dto.ids as Uuid[]);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/teaching-strategies")
  @HttpCode(200)
  async setTeachingStrategies(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LessonPlan> {
    const dto = parseBody(stringListSchema, body);
    return this.service.setTeachingStrategies(tenantOf(principal), id as Uuid, dto.items);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/activities")
  @HttpCode(200)
  async setActivities(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LessonPlan> {
    const dto = parseBody(stringListSchema, body);
    return this.service.setActivities(tenantOf(principal), id as Uuid, dto.items);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/assessment-checkpoints")
  @HttpCode(200)
  async setAssessmentCheckpoints(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LessonPlan> {
    const dto = parseBody(stringListSchema, body);
    return this.service.setAssessmentCheckpoints(tenantOf(principal), id as Uuid, dto.items);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/required-resources")
  @HttpCode(200)
  async setRequiredResources(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LessonPlan> {
    const dto = parseBody(uuidListSchema, body);
    return this.service.setRequiredResources(tenantOf(principal), id as Uuid, dto.ids as Uuid[]);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/differentiation")
  @HttpCode(200)
  async setDifferentiation(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LessonPlan> {
    const dto = parseBody(stringListSchema, body);
    return this.service.setDifferentiation(tenantOf(principal), id as Uuid, dto.items);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/reflection-notes")
  @HttpCode(200)
  async setReflectionNotes(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LessonPlan> {
    const dto = parseBody(setReflectionNotesSchema, body);
    return this.service.setReflectionNotes(tenantOf(principal), id as Uuid, dto.notes);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/submit")
  @HttpCode(200)
  async submitForReview(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<LessonPlan> {
    return this.service.submitForReview(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/approve")
  @HttpCode(200)
  async approve(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<LessonPlan> {
    return this.service.approve(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/request-changes")
  @HttpCode(200)
  async requestChanges(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<LessonPlan> {
    return this.service.requestChanges(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/revise")
  @HttpCode(200)
  async revise(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LessonPlan> {
    const dto = parseBody(noteSchema, body);
    return this.service.revise(tenantOf(principal), id as Uuid, dto.note);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<LessonPlan> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }
}
