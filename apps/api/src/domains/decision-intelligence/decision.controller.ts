import type { Principal } from "@knowget/auth";
import {
  type DecisionRecord,
  DecisionService,
  declareAction,
} from "@knowget/decision-intelligence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  DECISION_DECIDE,
  DECISION_OPERATE,
  DECISION_READ,
  deciderOf,
  parseBody,
  tenantOf,
} from "./decision-intelligence-http";
import {
  compensationRefSchema,
  decideSchema,
  executionErrorSchema,
  executionRefSchema,
} from "./decision-intelligence.dto";
import { DI_DECISION_SERVICE } from "./decision-intelligence.tokens";

/**
 * REST surface for decision records (P2-D27) — what the institution actually decided, and what followed.
 *
 * Taking a decision is `decision:decide` and is the one thing on this domain's whole surface that no other scope
 * implies. Carrying one out is `decision:operate`. That is the contract's first rule as authorization: an
 * automation that stopped for a person has bought the institution nothing if the same credential that runs the
 * machinery can also supply the person's answer.
 *
 * There is no delete. A decision record is the institution's account of what it did, on whose authority and on
 * what grounds, and the grounds are snapshotted onto it at the moment it is taken — the risk, the impact, the
 * confidence and the evidence ids as they stood — so that a later edit to the recommendation cannot quietly
 * rewrite what a past decision was based on.
 */
@Controller("decision/decisions")
export class DecisionController {
  constructor(@Inject(DI_DECISION_SERVICE) private readonly service: DecisionService) {}

  /**
   * Answer an open recommendation, and record the answer.
   *
   * The body carries the disposition, an optional note and the action the decision authorizes — and nothing
   * else. Risk, impact, confidence and the evidence ids are taken from the recommendation rather than accepted
   * here, because a decision that let its caller restate the grounds it was taken on would record the caller's
   * account of the past rather than the institution's.
   */
  @RequirePermissions(DECISION_DECIDE)
  @Post("by-recommendation/:recommendationId")
  @HttpCode(201)
  async decide(
    @CurrentPrincipal() principal: Principal,
    @Param("recommendationId") recommendationId: string,
    @Body() body: unknown,
  ): Promise<DecisionRecord> {
    const dto = parseBody(decideSchema, body);
    return this.service.decide(tenantOf(principal), recommendationId as Uuid, {
      disposition: dto.disposition,
      decidedByUserId: deciderOf(principal),
      note: dto.note ?? null,
      action: dto.action
        ? declareAction({
            kind: dto.action.kind,
            targetKey: dto.action.targetKey ?? null,
            riskLevel: dto.action.riskLevel,
            reversibility: dto.action.reversibility,
            compensationKey: dto.action.compensationKey ?? null,
          })
        : null,
    });
  }

  /**
   * Hand what was decided to the runtime. The action's capabilities are re-checked here rather than trusted
   * from the moment the decision was taken: a decision can sit awaiting execution while the capability it names
   * is deprecated, and this is the last cheap moment to find that out.
   */
  @RequirePermissions(DECISION_OPERATE)
  @Post(":id/request-execution")
  @HttpCode(200)
  async requestExecution(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<DecisionRecord> {
    const dto = parseBody(executionRefSchema, body);
    return this.service.requestExecution(tenantOf(principal), id as Uuid, dto.executionRef);
  }

  @RequirePermissions(DECISION_OPERATE)
  @Post(":id/complete-execution")
  @HttpCode(200)
  async completeExecution(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<DecisionRecord> {
    return this.service.completeExecution(tenantOf(principal), id as Uuid);
  }

  /** The runtime could not carry it out. The obligation to put things back survives the failure. */
  @RequirePermissions(DECISION_OPERATE)
  @Post(":id/fail-execution")
  @HttpCode(200)
  async failExecution(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<DecisionRecord> {
    const dto = parseBody(executionErrorSchema, body);
    return this.service.failExecution(tenantOf(principal), id as Uuid, dto.error);
  }

  /**
   * Put back what was done. The compensating capability is checked invocable before the reversal is recorded —
   * a decision marked compensated against a capability nobody can reach is worse than one still marked
   * outstanding, because the institution stops looking at it.
   */
  @RequirePermissions(DECISION_OPERATE)
  @Post(":id/compensate")
  @HttpCode(200)
  async compensate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<DecisionRecord> {
    const dto = parseBody(compensationRefSchema, body);
    return this.service.compensate(tenantOf(principal), id as Uuid, dto.compensationRef);
  }

  @RequirePermissions(DECISION_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly DecisionRecord[]> {
    return this.service.list(tenantOf(principal));
  }

  /** Everything the institution has done and declared it could undo, and has not yet undone. */
  @RequirePermissions(DECISION_READ)
  @Get("compensation-due")
  async listCompensationDue(
    @CurrentPrincipal() principal: Principal,
  ): Promise<readonly DecisionRecord[]> {
    return this.service.listCompensationDue(tenantOf(principal));
  }

  /**
   * Every decision ever taken about one recommendation, oldest first. More than one is normal: a deferral is a
   * decision, and the trail of deferrals before an answer is exactly what a governance review asks to see.
   */
  @RequirePermissions(DECISION_READ)
  @Get("by-recommendation/:recommendationId")
  async listByRecommendation(
    @CurrentPrincipal() principal: Principal,
    @Param("recommendationId") recommendationId: string,
  ): Promise<readonly DecisionRecord[]> {
    return this.service.listByRecommendation(tenantOf(principal), recommendationId as Uuid);
  }

  @RequirePermissions(DECISION_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<DecisionRecord> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
