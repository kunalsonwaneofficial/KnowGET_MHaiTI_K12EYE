import type { Principal } from "@knowget/auth";
import {
  type GrowthGoalInput,
  type GrowthPlan,
  GrowthPlanService,
} from "@knowget/learning-intelligence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  actorNoteSchema,
  createGrowthPlanSchema,
  linkRecommendationSchema,
  recordGoalOutcomeSchema,
  setGoalsSchema,
} from "./learning-intelligence.dto";
import { INSIGHT_READ, INSIGHT_WRITE, parseBody, tenantOf } from "./learning-intelligence-http";
import { LI_GROWTH_PLAN_SERVICE } from "./learning-intelligence.tokens";

/** REST surface for growth plans (P2-D11). Gated by insight:*; tenant-scoped. */
@Controller("learning-intelligence/growth-plans")
export class GrowthPlanController {
  constructor(@Inject(LI_GROWTH_PLAN_SERVICE) private readonly service: GrowthPlanService) {}

  @RequirePermissions(INSIGHT_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<GrowthPlan> {
    const dto = parseBody(createGrowthPlanSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      studentId: dto.studentId as Uuid,
      title: dto.title,
      ...(dto.focusDimension !== undefined ? { focusDimension: dto.focusDimension } : {}),
      ...(dto.goals !== undefined ? { goals: dto.goals as GrowthGoalInput[] } : {}),
      ...(dto.sourceRecommendationIds !== undefined
        ? { sourceRecommendationIds: dto.sourceRecommendationIds as Uuid[] }
        : {}),
    });
  }

  @RequirePermissions(INSIGHT_READ)
  @Get("by-student/:studentId")
  async listForStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<GrowthPlan[]> {
    return this.service.listForStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(INSIGHT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<GrowthPlan[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(INSIGHT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<GrowthPlan> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(INSIGHT_WRITE)
  @Post(":id/goals")
  @HttpCode(200)
  async setGoals(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<GrowthPlan> {
    const dto = parseBody(setGoalsSchema, body);
    return this.service.setGoals(tenantOf(principal), id as Uuid, dto.goals as GrowthGoalInput[]);
  }

  @RequirePermissions(INSIGHT_WRITE)
  @Post(":id/link-recommendation")
  @HttpCode(200)
  async linkRecommendation(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<GrowthPlan> {
    const dto = parseBody(linkRecommendationSchema, body);
    return this.service.linkRecommendation(
      tenantOf(principal),
      id as Uuid,
      dto.recommendationId as Uuid,
    );
  }

  @RequirePermissions(INSIGHT_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<GrowthPlan> {
    const dto = parseBody(actorNoteSchema, body);
    return this.service.activate(
      tenantOf(principal),
      id as Uuid,
      (dto.actor as Uuid | null | undefined) ?? null,
    );
  }

  @RequirePermissions(INSIGHT_WRITE)
  @Post(":id/goal-outcome")
  @HttpCode(200)
  async recordGoalOutcome(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<GrowthPlan> {
    const dto = parseBody(recordGoalOutcomeSchema, body);
    return this.service.recordGoalOutcome(
      tenantOf(principal),
      id as Uuid,
      dto.goalId as Uuid,
      dto.outcome,
      dto.note ?? null,
      (dto.actor as Uuid | null | undefined) ?? null,
    );
  }

  @RequirePermissions(INSIGHT_WRITE)
  @Post(":id/achieve")
  @HttpCode(200)
  async achieve(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<GrowthPlan> {
    const dto = parseBody(actorNoteSchema, body);
    return this.service.achieve(
      tenantOf(principal),
      id as Uuid,
      (dto.actor as Uuid | null | undefined) ?? null,
    );
  }

  @RequirePermissions(INSIGHT_WRITE)
  @Post(":id/abandon")
  @HttpCode(200)
  async abandon(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<GrowthPlan> {
    const dto = parseBody(actorNoteSchema, body);
    return this.service.abandon(
      tenantOf(principal),
      id as Uuid,
      (dto.actor as Uuid | null | undefined) ?? null,
      dto.note ?? null,
    );
  }
}
