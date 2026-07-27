import type { Principal } from "@knowget/auth";
import {
  type ActionView,
  type AutomationCondition,
  type AutomationRule,
  AutomationService,
  declareAction,
  declareCondition,
} from "@knowget/decision-intelligence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  DECISION_MANAGE,
  DECISION_READ,
  deciderOf,
  parseBody,
  tenantOf,
} from "./decision-intelligence-http";
import {
  type ActionInput,
  type ConditionInput,
  addConditionSchema,
  amendRuleSchema,
  draftRuleSchema,
  matchingRulesSchema,
} from "./decision-intelligence.dto";
import { DI_AUTOMATION_SERVICE } from "./decision-intelligence.tokens";

/**
 * REST surface for automation rules (P2-D27) — the standing instructions an institution has armed.
 *
 * Governance, not runtime: writing here is `decision:manage`, because a rule is the institution deciding in
 * advance what it will do without being asked again. Firing one is `decision:operate` and lives on the
 * automation-runs controller.
 *
 * An action declares what it would do, how risky the institution considers it, whether it can be undone and by
 * what — and that is the whole surface the autonomy gate reads. Nothing here accepts a script or a payload: a
 * rule that could carry executable intent would put the gate on the wrong side of the thing it is gating.
 * Capability references are checked invocable when the rule is drafted, when its action is amended, and again
 * when it is armed, because a draft can sit for weeks between being written and being turned on.
 */
@Controller("decision/automation-rules")
export class AutomationRuleController {
  constructor(@Inject(DI_AUTOMATION_SERVICE) private readonly service: AutomationService) {}

  /** Draft a rule. Whatever the body asks for, what comes back is a draft — nothing here can arm itself. */
  @RequirePermissions(DECISION_MANAGE)
  @Post()
  @HttpCode(201)
  async draft(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<AutomationRule> {
    const dto = parseBody(draftRuleSchema, body);
    return this.service.draft({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      key: dto.key,
      name: dto.name,
      description: dto.description ?? null,
      signalKey: dto.signalKey,
      conditions: (dto.conditions ?? []).map(toCondition),
      action: toAction(dto.action),
      autonomyMode: dto.autonomyMode,
      createdByUserId: deciderOf(principal),
    });
  }

  /**
   * The rules a signal carrying these facts would fire — evaluated and not acted on.
   *
   * `decision:read` despite being a POST: nothing is written and nothing fires, and the method is a POST only
   * because the facts to evaluate against are a document rather than a query string. This is what an
   * administrator asks before arming a rule, and it is the same evaluation the run service performs when a
   * signal actually arrives, so what the dry run shows and what the platform then does cannot disagree.
   */
  @RequirePermissions(DECISION_READ)
  @Post("matching/:signalKey")
  @HttpCode(200)
  async matching(
    @CurrentPrincipal() principal: Principal,
    @Param("signalKey") signalKey: string,
    @Body() body: unknown,
  ): Promise<readonly AutomationRule[]> {
    const dto = parseBody(matchingRulesSchema, body);
    return this.service.matching(tenantOf(principal), signalKey, dto.facts ?? {});
  }

  /** Change a rule that is not currently firing. A new action is re-checked before it is accepted. */
  @RequirePermissions(DECISION_MANAGE)
  @Post(":id/amend")
  @HttpCode(200)
  async amend(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AutomationRule> {
    const dto = parseBody(amendRuleSchema, body);
    return this.service.amend(tenantOf(principal), id as Uuid, {
      name: dto.name,
      description: dto.description,
      signalKey: dto.signalKey,
      conditions: dto.conditions?.map(toCondition),
      action: dto.action ? toAction(dto.action) : undefined,
      autonomyMode: dto.autonomyMode,
    });
  }

  /** Narrow when the rule fires by one more fact. Arity is the domain's to enforce, not the schema's. */
  @RequirePermissions(DECISION_MANAGE)
  @Post(":id/conditions")
  @HttpCode(200)
  async addCondition(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AutomationRule> {
    const dto = parseBody(addConditionSchema, body);
    return this.service.addCondition(tenantOf(principal), id as Uuid, toCondition(dto));
  }

  /**
   * Arm the rule. The last moment before it starts acting on its own, and so the moment its capabilities are
   * checked again and the autonomy engine is asked whether it will have the mode at all — a rule that claims
   * `auto_execute` over something the institution has declared irreversible is refused here, by the engine,
   * rather than at the first firing when there is a subject waiting on the other side of it.
   */
  @RequirePermissions(DECISION_MANAGE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AutomationRule> {
    return this.service.activate(tenantOf(principal), id as Uuid, {
      activatedByUserId: deciderOf(principal),
    });
  }

  /** Stop it firing without giving it up. The way an institution turns something off in a hurry. */
  @RequirePermissions(DECISION_MANAGE)
  @Post(":id/pause")
  @HttpCode(200)
  async pause(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AutomationRule> {
    return this.service.pause(tenantOf(principal), id as Uuid);
  }

  /** Give it up for good. The runs it fired stay, and stay pointed at it. */
  @RequirePermissions(DECISION_MANAGE)
  @Post(":id/retire")
  @HttpCode(200)
  async retire(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AutomationRule> {
    return this.service.retire(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(DECISION_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly AutomationRule[]> {
    return this.service.list(tenantOf(principal));
  }

  /** The active rules listening for one signal — what a dispatcher would consider. */
  @RequirePermissions(DECISION_READ)
  @Get("by-signal/:signalKey")
  async listBySignal(
    @CurrentPrincipal() principal: Principal,
    @Param("signalKey") signalKey: string,
  ): Promise<readonly AutomationRule[]> {
    return this.service.listBySignal(tenantOf(principal), signalKey);
  }

  /** The rule under this key, or `null`. Keys are unique per tenant, which is what makes this answerable. */
  @RequirePermissions(DECISION_READ)
  @Get("by-key/:key")
  async findByKey(
    @CurrentPrincipal() principal: Principal,
    @Param("key") key: string,
  ): Promise<AutomationRule | null> {
    return this.service.findByKey(tenantOf(principal), key);
  }

  @RequirePermissions(DECISION_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AutomationRule> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }

  /** Drop every condition on one fact. Widens what the rule fires on, so it is a `manage` write. */
  @RequirePermissions(DECISION_MANAGE)
  @Delete(":id/conditions/:key")
  @HttpCode(200)
  async removeConditions(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("key") key: string,
  ): Promise<AutomationRule> {
    return this.service.removeConditions(tenantOf(principal), id as Uuid, key);
  }

  /**
   * Delete a rule that is not live. Bounded to drafts and paused rules by the aggregate: an active rule has to
   * be paused first, because deleting something mid-flight is how an institution loses track of what was
   * running, and a retired rule is kept because the runs it fired point at it.
   */
  @RequirePermissions(DECISION_MANAGE)
  @Delete(":id")
  @HttpCode(204)
  async discard(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<void> {
    return this.service.discard(tenantOf(principal), id as Uuid);
  }
}

/** Declare an action through the domain, so the gate reads the platform's shape and not the request's. */
const toAction = (dto: ActionInput): ActionView =>
  declareAction({
    kind: dto.kind,
    targetKey: dto.targetKey ?? null,
    riskLevel: dto.riskLevel,
    reversibility: dto.reversibility,
    compensationKey: dto.compensationKey ?? null,
  });

/** Mint a condition through the domain, which normalizes its key and enforces its operator's arity. */
const toCondition = (dto: ConditionInput): AutomationCondition =>
  declareCondition({
    key: dto.key,
    operator: dto.operator,
    values: dto.values ?? [],
  });
