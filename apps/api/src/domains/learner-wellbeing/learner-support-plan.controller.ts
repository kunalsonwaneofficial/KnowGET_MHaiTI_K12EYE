import type { Principal } from "@knowget/auth";
import {
  type LearnerSupportPlan,
  LearnerSupportPlanService,
  type SupportGoal,
} from "@knowget/learner-wellbeing";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  addSupportGoalSchema,
  createSupportPlanSchema,
  recordReviewSchema,
  setListSchema,
  setReviewScheduleSchema,
  updateSupportGoalStatusSchema,
} from "./learner-wellbeing.dto";
import { parseBody, SUPPORT_READ, SUPPORT_WRITE, tenantOf } from "./learner-wellbeing-http";
import { LW_SUPPORT_PLAN_SERVICE } from "./learner-wellbeing.tokens";

/** REST surface for learner support plans (P2-D05). Gated by support:*; tenant-scoped. */
@Controller("learner-wellbeing/support-plans")
export class LearnerSupportPlanController {
  constructor(
    @Inject(LW_SUPPORT_PLAN_SERVICE) private readonly service: LearnerSupportPlanService,
  ) {}

  @RequirePermissions(SUPPORT_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<LearnerSupportPlan> {
    const dto = parseBody(createSupportPlanSchema, body);
    return this.service.create({ tenantId: tenantOf(principal), studentId: dto.studentId as Uuid });
  }

  @RequirePermissions(SUPPORT_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<LearnerSupportPlan[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(SUPPORT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<LearnerSupportPlan[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(SUPPORT_READ)
  @Get("by-student/:studentId")
  async getByStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<LearnerSupportPlan | null> {
    return this.service.getByStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(SUPPORT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<LearnerSupportPlan> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SUPPORT_WRITE)
  @Post(":id/academic-accommodations")
  @HttpCode(200)
  async setAcademicAccommodations(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LearnerSupportPlan> {
    const dto = parseBody(setListSchema, body);
    return this.service.setAcademicAccommodations(tenantOf(principal), id as Uuid, dto.items);
  }

  @RequirePermissions(SUPPORT_WRITE)
  @Post(":id/medical-accommodations")
  @HttpCode(200)
  async setMedicalAccommodations(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LearnerSupportPlan> {
    const dto = parseBody(setListSchema, body);
    return this.service.setMedicalAccommodations(tenantOf(principal), id as Uuid, dto.items);
  }

  @RequirePermissions(SUPPORT_WRITE)
  @Post(":id/behaviour-interventions")
  @HttpCode(200)
  async setBehaviourInterventions(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LearnerSupportPlan> {
    const dto = parseBody(setListSchema, body);
    return this.service.setBehaviourInterventions(tenantOf(principal), id as Uuid, dto.items);
  }

  @RequirePermissions(SUPPORT_WRITE)
  @Post(":id/inclusion-strategies")
  @HttpCode(200)
  async setInclusionStrategies(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LearnerSupportPlan> {
    const dto = parseBody(setListSchema, body);
    return this.service.setInclusionStrategies(tenantOf(principal), id as Uuid, dto.items);
  }

  @RequirePermissions(SUPPORT_WRITE)
  @Post(":id/goals")
  @HttpCode(201)
  async addGoal(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ plan: LearnerSupportPlan; goal: SupportGoal }> {
    const dto = parseBody(addSupportGoalSchema, body);
    return this.service.addGoal(tenantOf(principal), id as Uuid, {
      description: dto.description,
      ...(dto.targetDate !== undefined ? { targetDate: dto.targetDate } : {}),
    });
  }

  @RequirePermissions(SUPPORT_WRITE)
  @Post(":id/goals/:goalId/status")
  @HttpCode(200)
  async updateGoalStatus(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("goalId") goalId: string,
    @Body() body: unknown,
  ): Promise<LearnerSupportPlan> {
    const dto = parseBody(updateSupportGoalStatusSchema, body);
    return this.service.updateGoalStatus(
      tenantOf(principal),
      id as Uuid,
      goalId as Uuid,
      dto.status,
    );
  }

  @RequirePermissions(SUPPORT_WRITE)
  @Post(":id/goals/:goalId/remove")
  @HttpCode(200)
  async removeGoal(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("goalId") goalId: string,
  ): Promise<LearnerSupportPlan> {
    return this.service.removeGoal(tenantOf(principal), id as Uuid, goalId as Uuid);
  }

  @RequirePermissions(SUPPORT_WRITE)
  @Post(":id/review-schedule")
  @HttpCode(200)
  async setReviewSchedule(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LearnerSupportPlan> {
    const dto = parseBody(setReviewScheduleSchema, body);
    return this.service.setReviewSchedule(tenantOf(principal), id as Uuid, {
      ...(dto.frequency !== undefined ? { frequency: dto.frequency } : {}),
      ...(dto.nextReviewOn !== undefined ? { nextReviewOn: dto.nextReviewOn } : {}),
    });
  }

  @RequirePermissions(SUPPORT_WRITE)
  @Post(":id/reviews")
  @HttpCode(200)
  async recordReview(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LearnerSupportPlan> {
    const dto = parseBody(recordReviewSchema, body);
    const tenant = tenantOf(principal);
    return dto.reviewedOn !== undefined
      ? this.service.recordReview(tenant, id as Uuid, dto.reviewedOn)
      : this.service.recordReview(tenant, id as Uuid);
  }

  @RequirePermissions(SUPPORT_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<LearnerSupportPlan> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SUPPORT_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<LearnerSupportPlan> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }
}
