import type { Principal } from "@knowget/auth";
import { type StrategicPlan, StrategicPlanService } from "@knowget/predictive-intelligence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  FORECAST_PLAN,
  FORECAST_READ,
  actorOf,
  parseBody,
  tenantOf,
} from "./predictive-intelligence-http";
import {
  abandonPlanSchema,
  addObjectivesSchema,
  amendObjectiveSchema,
  amendPlanSchema,
  draftPlanSchema,
  recordProgressSchema,
  reviewPlanSchema,
} from "./predictive-intelligence.dto";
import { PI_PLAN_SERVICE } from "./predictive-intelligence.tokens";

/**
 * REST surface for strategic plans (P2-D28) — where the institution commits to something.
 *
 * This is the only place in the domain where a projection turns into an intention, and it carries its own
 * scope for exactly that reason. Producing a forecast is an operational act; setting a target against one,
 * activating it, and answering for it at review are leadership acts an institution is held to. The ability to
 * project is not the ability to commit, and `forecast:plan` is that sentence written as authorization.
 *
 * Objectives are frozen at activation. A target that could be moved after the fact is not a target — the
 * question a review exists to answer is whether the institution met what it said it would, and a plan whose
 * objectives track its performance always meets them.
 *
 * A review keeps the variance it saw rather than one recomputed on read, which is the difference between a
 * record of what leadership was told and a recalculation of what they should have been told. It also keeps the
 * plan version it was computed against, so a review and the objective set behind it cannot drift apart.
 */
@Controller("forecast/plans")
export class StrategicPlanController {
  constructor(@Inject(PI_PLAN_SERVICE) private readonly service: StrategicPlanService) {}

  /**
   * Draft a plan. Objectives may be supplied here or added while it is still a draft.
   *
   * The start period anchors every target the plan will carry, and it is stated once: an objective aiming at
   * period 12 means twelve periods from where this plan begins, on the grain its series are measured at.
   */
  @RequirePermissions(FORECAST_PLAN)
  @Post()
  @HttpCode(201)
  async draft(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<StrategicPlan> {
    const dto = parseBody(draftPlanSchema, body);
    return this.service.draft({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      planKey: dto.planKey,
      name: dto.name,
      description: dto.description ?? null,
      startPeriod: dto.startPeriod,
      objectives: dto.objectives,
    });
  }

  /** Rename or redescribe. Objectives change through their own routes, and only while the plan is a draft. */
  @RequirePermissions(FORECAST_PLAN)
  @Post(":id/amend")
  @HttpCode(200)
  async amend(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<StrategicPlan> {
    const dto = parseBody(amendPlanSchema, body);
    return this.service.amend(tenantOf(principal), id as Uuid, dto);
  }

  /** Set targets. Each names the metric it measures and the direction that counts as better on it. */
  @RequirePermissions(FORECAST_PLAN)
  @Post(":id/objectives")
  @HttpCode(200)
  async addObjectives(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<StrategicPlan> {
    const dto = parseBody(addObjectivesSchema, body);
    return this.service.addObjectives(tenantOf(principal), id as Uuid, dto.objectives);
  }

  /** Restate one target. Its key is its identity and is therefore in the path, not the body. */
  @RequirePermissions(FORECAST_PLAN)
  @Post(":id/objectives/:objectiveKey/amend")
  @HttpCode(200)
  async amendObjective(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("objectiveKey") objectiveKey: string,
    @Body() body: unknown,
  ): Promise<StrategicPlan> {
    const dto = parseBody(amendObjectiveSchema, body);
    return this.service.amendObjective(tenantOf(principal), id as Uuid, objectiveKey, dto);
  }

  /**
   * Commit. The objectives freeze here, and the person activating is the principal rather than the body — a
   * plan is something an institution is held to, and being held to it starts with knowing who signed it.
   */
  @RequirePermissions(FORECAST_PLAN)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<StrategicPlan> {
    return this.service.activate(tenantOf(principal), id as Uuid, actorOf(principal));
  }

  /** Close a plan that ran its course. What was achieved and what was missed both stay on the record. */
  @RequirePermissions(FORECAST_PLAN)
  @Post(":id/complete")
  @HttpCode(200)
  async complete(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<StrategicPlan> {
    return this.service.complete(tenantOf(principal), id as Uuid, actorOf(principal));
  }

  /**
   * Stop a plan before its course was run, and say why.
   *
   * The reason is optional at the edge and nullable underneath, so silence is recorded as silence rather than
   * as an explanation nobody gave. Abandoned plans are kept: the record that a course was tried and changed is
   * exactly what a later leadership needs, and deleting it turns a decision into an omission.
   */
  @RequirePermissions(FORECAST_PLAN)
  @Post(":id/abandon")
  @HttpCode(200)
  async abandon(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<StrategicPlan> {
    const dto = parseBody(abandonPlanSchema, body);
    return this.service.abandon(
      tenantOf(principal),
      id as Uuid,
      actorOf(principal),
      dto.reason ?? null,
    );
  }

  /**
   * Record what actually happened against the targets.
   *
   * Readings are kept in arrival order rather than sorted by period, because the latest reading is the one
   * recorded last and not the one at the highest period — a correction arriving after a later reading is
   * precisely the case a sort would silently reorder into the wrong answer.
   */
  @RequirePermissions(FORECAST_PLAN)
  @Post(":id/progress")
  @HttpCode(200)
  async recordProgress(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<StrategicPlan> {
    const dto = parseBody(recordProgressSchema, body);
    return this.service.recordProgress(tenantOf(principal), id as Uuid, dto.readings);
  }

  /**
   * Review the plan at a period and freeze what it said.
   *
   * The variance is computed by the domain and never accepted from the body. A review whose caller supplied
   * its own account of the gap would record the caller's reading of the plan rather than the plan's reading of
   * itself, which is the one thing a review exists to prevent. The reviewer is the principal, for the same
   * reason: a review is a person's judgement on the record, not a field in a request.
   */
  @RequirePermissions(FORECAST_PLAN)
  @Post(":id/reviews")
  @HttpCode(201)
  async review(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<StrategicPlan> {
    const dto = parseBody(reviewPlanSchema, body);
    return this.service.review(tenantOf(principal), id as Uuid, {
      period: dto.period,
      reviewedByUserId: actorOf(principal),
      note: dto.note ?? null,
    });
  }

  @RequirePermissions(FORECAST_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly StrategicPlan[]> {
    return this.service.list(tenantOf(principal));
  }

  /** What the institution is currently committed to. Drafts are not commitments; closed plans are history. */
  @RequirePermissions(FORECAST_READ)
  @Get("active")
  async listActive(@CurrentPrincipal() principal: Principal): Promise<readonly StrategicPlan[]> {
    return this.service.listActive(tenantOf(principal));
  }

  /** The plan an organization keeps under a key, or `null` where it keeps none. */
  @RequirePermissions(FORECAST_READ)
  @Get("by-key/:organizationId/:planKey")
  async findByKey(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
    @Param("planKey") planKey: string,
  ): Promise<StrategicPlan | null> {
    return this.service.findByKey(tenantOf(principal), organizationId as Uuid, planKey);
  }

  /**
   * Every plan with an objective on one metric.
   *
   * The read a data steward reaches for after correcting history: a restated observation changes what the
   * series says, and this is how the institution finds every commitment that was being judged against it.
   */
  @RequirePermissions(FORECAST_READ)
  @Get("by-metric/:metricKey")
  async listByMetric(
    @CurrentPrincipal() principal: Principal,
    @Param("metricKey") metricKey: string,
  ): Promise<readonly StrategicPlan[]> {
    return this.service.listByMetric(tenantOf(principal), metricKey);
  }

  /** Every plan one organization has ever drafted — including the ones it abandoned. */
  @RequirePermissions(FORECAST_READ)
  @Get("by-organization/:organizationId")
  async listByOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<readonly StrategicPlan[]> {
    return this.service.listByOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(FORECAST_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<StrategicPlan> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }

  /**
   * Drop a target from a draft. Returns the plan, because what remains is what the caller needs to see.
   *
   * There is no route that removes a plan. An abandoned plan is the record that a course was tried and
   * changed, and the objectives it was abandoned with are the most useful part of that record.
   */
  @RequirePermissions(FORECAST_PLAN)
  @Delete(":id/objectives/:objectiveKey")
  @HttpCode(200)
  async removeObjective(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("objectiveKey") objectiveKey: string,
  ): Promise<StrategicPlan> {
    return this.service.removeObjective(tenantOf(principal), id as Uuid, objectiveKey);
  }
}
