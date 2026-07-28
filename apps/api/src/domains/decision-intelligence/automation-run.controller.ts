import type { Principal } from "@knowget/auth";
import { type AutomationRun, AutomationRunService } from "@knowget/decision-intelligence";
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
  approveRunSchema,
  compensationRefSchema,
  completeRunSchema,
  executionErrorSchema,
  executionRefSchema,
  fireRuleSchema,
  rejectRunSchema,
} from "./decision-intelligence.dto";
import { DI_AUTOMATION_RUN_SERVICE } from "./decision-intelligence.tokens";

/**
 * REST surface for automation runs (P2-D27) — every time a standing rule was reached, and what the gate said.
 *
 * A run is written whatever the gate decided, including when the gate refused the firing outright. That is
 * deliberate and is what makes this the contract's first rule as a record rather than as a claim: an institution
 * can ask what its automation *wanted* to do and was not allowed to, which is exactly the thing a design that
 * only recorded successful firings could never answer.
 *
 * Firing and executing are `decision:operate`. Approving and refusing a gated firing are `decision:decide`, and
 * that separation is the whole point of the gate: an operator who can fire a rule must not also be able to clear
 * the approval it stopped for, or the gate records a signature where it was meant to record a decision.
 */
@Controller("decision/automation-runs")
export class AutomationRunController {
  constructor(@Inject(DI_AUTOMATION_RUN_SERVICE) private readonly service: AutomationRunService) {}

  /** Fire one named rule. `201`, because exactly one run is written — whatever the gate then decided. */
  @RequirePermissions(DECISION_OPERATE)
  @Post("by-rule/:ruleId")
  @HttpCode(201)
  async fire(
    @CurrentPrincipal() principal: Principal,
    @Param("ruleId") ruleId: string,
    @Body() body: unknown,
  ): Promise<AutomationRun> {
    const dto = parseBody(fireRuleSchema, body);
    return this.service.fire(tenantOf(principal), ruleId as Uuid, {
      subjectDomain: dto.subjectDomain,
      subjectId: dto.subjectId,
      facts: dto.facts ?? {},
      recommendationId: dto.recommendationId ? (dto.recommendationId as Uuid) : null,
    });
  }

  /**
   * Dispatch a signal: every armed rule listening for it whose conditions these facts satisfy fires once.
   *
   * `200` and not `201`, because an empty result is the ordinary outcome. Most signals an institution emits
   * match nothing — that is what having conditions is for — and a caller should not have to treat "nothing was
   * listening" as a special case of "something was created".
   */
  @RequirePermissions(DECISION_OPERATE)
  @Post("by-signal/:signalKey")
  @HttpCode(200)
  async fireOnSignal(
    @CurrentPrincipal() principal: Principal,
    @Param("signalKey") signalKey: string,
    @Body() body: unknown,
  ): Promise<readonly AutomationRun[]> {
    const dto = parseBody(fireRuleSchema, body);
    return this.service.fireOnSignal(tenantOf(principal), signalKey, {
      subjectDomain: dto.subjectDomain,
      subjectId: dto.subjectId,
      facts: dto.facts ?? {},
      recommendationId: dto.recommendationId ? (dto.recommendationId as Uuid) : null,
    });
  }

  /**
   * A named person lets a gated firing proceed. `decision:decide`, and never `decision:operate`: this endpoint
   * is the entire value of stopping for a human, and it is worth nothing if the credential that fired the rule
   * can also answer for it.
   */
  @RequirePermissions(DECISION_DECIDE)
  @Post(":id/approve")
  @HttpCode(200)
  async approve(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AutomationRun> {
    const dto = parseBody(approveRunSchema, body);
    return this.service.approve(tenantOf(principal), id as Uuid, {
      approvedByUserId: deciderOf(principal),
      note: dto.note ?? null,
    });
  }

  /** A named person refuses it. Nothing about the rule changes; only this firing is over. */
  @RequirePermissions(DECISION_DECIDE)
  @Post(":id/reject")
  @HttpCode(200)
  async reject(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AutomationRun> {
    const dto = parseBody(rejectRunSchema, body);
    return this.service.reject(tenantOf(principal), id as Uuid, {
      rejectedByUserId: deciderOf(principal),
      reason: dto.reason ?? null,
    });
  }

  /** Hand the authorized action to the runtime. Refused unless the gate actually cleared this firing. */
  @RequirePermissions(DECISION_OPERATE)
  @Post(":id/begin-execution")
  @HttpCode(200)
  async beginExecution(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AutomationRun> {
    const dto = parseBody(executionRefSchema, body);
    return this.service.beginExecution(tenantOf(principal), id as Uuid, dto.executionRef);
  }

  @RequirePermissions(DECISION_OPERATE)
  @Post(":id/complete")
  @HttpCode(200)
  async complete(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AutomationRun> {
    const dto = parseBody(completeRunSchema, body);
    return this.service.complete(tenantOf(principal), id as Uuid, {
      executionRef: dto.executionRef ?? null,
    });
  }

  /** The runtime could not carry it out. What was owed a reversal is still owed one. */
  @RequirePermissions(DECISION_OPERATE)
  @Post(":id/fail")
  @HttpCode(200)
  async fail(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AutomationRun> {
    const dto = parseBody(executionErrorSchema, body);
    return this.service.fail(tenantOf(principal), id as Uuid, dto.error);
  }

  /**
   * Put back what an automation did. The compensating capability is checked reachable before the reversal is
   * recorded — a run marked compensated against a capability nobody can invoke is worse than one still marked
   * outstanding, because the institution stops looking at it.
   */
  @RequirePermissions(DECISION_OPERATE)
  @Post(":id/compensate")
  @HttpCode(200)
  async compensate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AutomationRun> {
    const dto = parseBody(compensationRefSchema, body);
    return this.service.compensate(tenantOf(principal), id as Uuid, dto.compensationRef);
  }

  @RequirePermissions(DECISION_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly AutomationRun[]> {
    return this.service.list(tenantOf(principal));
  }

  /** The approval queue: firings the gate stopped, waiting on a person. */
  @RequirePermissions(DECISION_READ)
  @Get("awaiting-approval")
  async listAwaitingApproval(
    @CurrentPrincipal() principal: Principal,
  ): Promise<readonly AutomationRun[]> {
    return this.service.listAwaitingApproval(tenantOf(principal));
  }

  /** Firings that owe the institution a reversal and have not been given one. */
  @RequirePermissions(DECISION_READ)
  @Get("compensation-due")
  async listCompensationDue(
    @CurrentPrincipal() principal: Principal,
  ): Promise<readonly AutomationRun[]> {
    return this.service.listCompensationDue(tenantOf(principal));
  }

  /** Everything one rule has ever done — how a governance review reads a rule. */
  @RequirePermissions(DECISION_READ)
  @Get("by-rule/:ruleId")
  async listByRule(
    @CurrentPrincipal() principal: Principal,
    @Param("ruleId") ruleId: string,
  ): Promise<readonly AutomationRun[]> {
    return this.service.listByRule(tenantOf(principal), ruleId as Uuid);
  }

  /** Everything any automation has done about one subject — what was done to this student, by machine. */
  @RequirePermissions(DECISION_READ)
  @Get("by-subject/:subjectDomain/:subjectId")
  async listBySubject(
    @CurrentPrincipal() principal: Principal,
    @Param("subjectDomain") subjectDomain: string,
    @Param("subjectId") subjectId: string,
  ): Promise<readonly AutomationRun[]> {
    return this.service.listBySubject(tenantOf(principal), subjectDomain, subjectId);
  }

  @RequirePermissions(DECISION_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AutomationRun> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
