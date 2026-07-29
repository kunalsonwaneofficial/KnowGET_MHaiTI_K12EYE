import type { Principal } from "@knowget/auth";
import { type ImprovementCycle, ImprovementCycleService } from "@knowget/platform-evolution";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  EVOLUTION_GOVERN,
  EVOLUTION_MANAGE,
  EVOLUTION_READ,
  actorOf,
  parseBody,
  tenantOf,
} from "./platform-evolution-http";
import {
  abandonCycleSchema,
  openCycleSchema,
  rescheduleCycleSchema,
  restateCycleSchema,
} from "./platform-evolution.dto";
import { PE_CYCLE_SERVICE } from "./platform-evolution.tokens";

/**
 * REST surface for improvement cycles (P2-D30) — the declared span an institution improves *within*.
 *
 * A cycle is the container that makes continuous improvement checkable rather than aspirational. It is opened
 * against a stated intent and a span of periods, it moves through execution and review, and it closes with a
 * count of what it produced. That count is what the whole shape is for: a cycle that ran a full year, consumed
 * everybody's attention and closed having recorded no lessons is the finding, and an institution without this
 * record has no way to distinguish that year from a good one.
 *
 * Most of the lifecycle sits under `evolution:manage`, because opening, restating, rescheduling and moving a
 * cycle between stages are scheduling acts. Closure sits under `evolution:govern` and is the exception worth
 * stating: closing is where the cycle's account of itself becomes final, and a span that could be declared
 * complete by whoever was running it would let a disappointing cycle be closed quietly. Abandonment stays under
 * `evolution:manage` precisely because it is the honest alternative — a cycle that was overtaken by events
 * should be abandonable with a reason rather than dragged to a closure that claims something.
 *
 * Rescheduling is admissible only before execution starts. The aggregate holds that, and it is the rule that
 * keeps the span meaningful: an end period movable while the cycle is running would let a cycle that missed its
 * dates be recorded as having met them.
 */
@Controller("evolution/cycles")
export class ImprovementCycleController {
  constructor(@Inject(PE_CYCLE_SERVICE) private readonly service: ImprovementCycleService) {}

  /** Declare the span and what it is for. The intent is what review has to judge the cycle against. */
  @RequirePermissions(EVOLUTION_MANAGE)
  @Post()
  @HttpCode(201)
  async open(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<ImprovementCycle> {
    const dto = parseBody(openCycleSchema, body);
    return this.service.open({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      cycleKey: dto.cycleKey,
      intent: dto.intent,
      startPeriod: dto.startPeriod,
      endPeriod: dto.endPeriod,
      openedBy: actorOf(principal),
    });
  }

  /** Say the intent better, while the cycle is still something being planned. */
  @RequirePermissions(EVOLUTION_MANAGE)
  @Post(":id/restate")
  @HttpCode(200)
  async restate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ImprovementCycle> {
    const dto = parseBody(restateCycleSchema, body);
    return this.service.restate(tenantOf(principal), id as Uuid, dto.intent);
  }

  /** Move the span. Planning only — a cycle already running cannot be given the dates it happens to have met. */
  @RequirePermissions(EVOLUTION_MANAGE)
  @Post(":id/reschedule")
  @HttpCode(200)
  async reschedule(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ImprovementCycle> {
    const dto = parseBody(rescheduleCycleSchema, body);
    return this.service.reschedule(tenantOf(principal), id as Uuid, dto.startPeriod, dto.endPeriod);
  }

  /** Begin the work. From here the span is fixed and the cycle is answerable to it. */
  @RequirePermissions(EVOLUTION_MANAGE)
  @Post(":id/execute")
  @HttpCode(200)
  async startExecution(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ImprovementCycle> {
    return this.service.startExecution(tenantOf(principal), id as Uuid);
  }

  /** Stop working and start looking at what happened. The stage in which lessons are supposed to be drawn. */
  @RequirePermissions(EVOLUTION_MANAGE)
  @Post(":id/review")
  @HttpCode(200)
  async startReview(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ImprovementCycle> {
    return this.service.startReview(tenantOf(principal), id as Uuid);
  }

  /**
   * Close the cycle, counting the lessons it recorded. The count is taken once, here, rather than kept as a
   * running total — what the cycle produced is a fact about the cycle at the moment it ended, and a total that
   * kept moving afterwards would let a thin year improve retrospectively.
   */
  @RequirePermissions(EVOLUTION_GOVERN)
  @Post(":id/close")
  @HttpCode(200)
  async close(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ImprovementCycle> {
    return this.service.close(tenantOf(principal), id as Uuid, actorOf(principal));
  }

  /** Abandon it, with a reason. The honest end for a cycle that events overtook, and not a failed closure. */
  @RequirePermissions(EVOLUTION_MANAGE)
  @Post(":id/abandon")
  @HttpCode(200)
  async abandon(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ImprovementCycle> {
    const dto = parseBody(abandonCycleSchema, body);
    return this.service.abandon(tenantOf(principal), id as Uuid, actorOf(principal), dto.reason);
  }

  /** Every cycle in the tenant. */
  @RequirePermissions(EVOLUTION_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly ImprovementCycle[]> {
    return this.service.list(tenantOf(principal));
  }

  /**
   * What is in flight — planning, executing and reviewing alike, by start period. Committed order rather than
   * alphabetical, because overlapping cycles are the thing this read exists to make visible.
   */
  @RequirePermissions(EVOLUTION_READ)
  @Get("open/:organizationId")
  async listOpen(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<readonly ImprovementCycle[]> {
    return this.service.listOpen(tenantOf(principal), organizationId as Uuid);
  }

  /** One cycle by key. */
  @RequirePermissions(EVOLUTION_READ)
  @Get("by-key/:cycleKey")
  async getByKey(
    @CurrentPrincipal() principal: Principal,
    @Param("cycleKey") cycleKey: string,
  ): Promise<ImprovementCycle> {
    return this.service.getByKey(tenantOf(principal), cycleKey);
  }

  /** One cycle, or a 404. */
  @RequirePermissions(EVOLUTION_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ImprovementCycle> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
