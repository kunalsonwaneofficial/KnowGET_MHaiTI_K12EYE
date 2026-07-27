import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import type { AutomationRule, SignalFacts } from "./automation-rule";
import { matchingRules } from "./automation-rule";
import {
  type ApproveRunParams,
  type AutomationRun,
  type CompleteRunParams,
  type RejectRunParams,
  approveRun,
  beginRunExecution,
  compensateRun,
  completeRun,
  failRun,
  fireRule,
  rejectRun,
  runCompensationCapabilityKey,
} from "./automation-run";
import {
  automationRunApproved,
  automationRunCompensated,
  automationRunExecutionStarted,
  automationRunFailed,
  automationRunFired,
  automationRunRejected,
  automationRunSucceeded,
} from "./decision-events";
import type { RecommendationGateView } from "./decision-view";
import {
  AutomationRuleNotFoundError,
  AutomationRunNotFoundError,
  CapabilityNotInvocableError,
  RecommendationNotFoundError,
} from "./errors";
import type {
  AutomationRuleRepository,
  AutomationRunRepository,
  CapabilityDirectory,
  RecommendationRepository,
} from "./ports";
import { toRecommendationGateView } from "./recommendation";

/** What a caller supplies to fire a rule. The recommendation is named by id; the gate view is built here. */
export interface FireAutomationParams {
  readonly subjectDomain: string;
  readonly subjectId: string;
  /** The facts the signal carried. Only the ones the rule examines are kept on the run. */
  readonly facts?: SignalFacts;
  /** The recommendation being acted on, when there is one. */
  readonly recommendationId?: Uuid | null;
}

/**
 * Application service for automation runs — one firing of one standing rule, from gate to settlement.
 *
 * This is where the contract's first rule becomes something an institution can point at. The autonomy gate
 * itself is the engine's, and `fireRule` applies it: a low-risk reversible action under an `auto_execute` rule
 * starts life `gated` and may be carried out; anything higher starts `awaiting_approval` and waits for a named
 * person; anything the gate refuses outright starts `blocked` and no approval will move it. What this service
 * adds is that the gate is never handed a claim a caller assembled. A caller names a recommendation by id and
 * the gate view is built here from the stored aggregate, so a firing can never be talked past the gate by
 * describing an ungrounded recommendation as grounded.
 *
 * `fireOnSignal` is the dispatcher: one signal, every active rule that matches it, one run each. It is the only
 * method in this domain that writes more than one aggregate in a call, and it does so because that is what a
 * signal *is* — an event the institution observed, not a command to one rule.
 *
 * Compensation is checked at the moment it is exercised: before a run is recorded as put back, the capability
 * that would put it back is checked to be reachable. A reversal recorded against a capability nobody can call
 * is worse than no reversal, because the institution stops looking.
 */
export interface AutomationRunServiceDeps {
  readonly repository: AutomationRunRepository;
  readonly rules: AutomationRuleRepository;
  readonly recommendations: RecommendationRepository;
  readonly capabilities: CapabilityDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class AutomationRunService {
  private readonly repository: AutomationRunRepository;
  private readonly rules: AutomationRuleRepository;
  private readonly recommendations: RecommendationRepository;
  private readonly capabilities: CapabilityDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AutomationRunServiceDeps) {
    this.repository = deps.repository;
    this.rules = deps.rules;
    this.recommendations = deps.recommendations;
    this.capabilities = deps.capabilities;
    this.events = deps.events;
  }

  // --- Firing ----------------------------------------------------------------------

  /**
   * Fire one named rule. The run is written whatever the gate decided — including when the gate refused it
   * outright, because a refusal is the most interesting thing an autonomy record can hold.
   */
  async fire(
    tenantId: TenantId,
    ruleId: Uuid,
    params: FireAutomationParams,
  ): Promise<AutomationRun> {
    const rule = await this.requireRule(tenantId, ruleId);
    return this.fireOne(rule, params, await this.gateView(tenantId, params.recommendationId));
  }

  /**
   * Dispatch a signal: every active rule listening for it whose conditions these facts satisfy fires once.
   *
   * An empty result is a perfectly ordinary outcome and is not an error — most signals an institution emits
   * match nothing, which is what having conditions is for.
   */
  async fireOnSignal(
    tenantId: TenantId,
    signalKey: string,
    params: FireAutomationParams,
  ): Promise<readonly AutomationRun[]> {
    const listening = await this.rules.listBySignal(tenantId, signalKey);
    const matched = matchingRules(listening, signalKey, params.facts ?? {});
    if (matched.length === 0) {
      return [];
    }

    const recommendation = await this.gateView(tenantId, params.recommendationId);
    const runs: AutomationRun[] = [];
    for (const rule of matched) {
      runs.push(await this.fireOne(rule, params, recommendation));
    }
    return runs;
  }

  // --- Approval --------------------------------------------------------------------

  /** A named person lets a gated-for-approval firing proceed. */
  async approve(tenantId: TenantId, id: Uuid, params: ApproveRunParams): Promise<AutomationRun> {
    return this.transition(tenantId, id, approveRun, automationRunApproved, params);
  }

  /** A named person refuses it. Nothing about the rule changes; only this firing is over. */
  async reject(tenantId: TenantId, id: Uuid, params: RejectRunParams): Promise<AutomationRun> {
    return this.transition(tenantId, id, rejectRun, automationRunRejected, params);
  }

  // --- Execution -------------------------------------------------------------------

  /** Hand the authorized action to the runtime. Refused unless the gate actually cleared it. */
  async beginExecution(tenantId: TenantId, id: Uuid, executionRef: string): Promise<AutomationRun> {
    return this.transition(
      tenantId,
      id,
      beginRunExecution,
      automationRunExecutionStarted,
      executionRef,
    );
  }

  /** The runtime carried it out. */
  async complete(
    tenantId: TenantId,
    id: Uuid,
    params: CompleteRunParams = {},
  ): Promise<AutomationRun> {
    return this.transition(tenantId, id, completeRun, automationRunSucceeded, params);
  }

  /** The runtime could not. The compensation obligation survives the failure. */
  async fail(tenantId: TenantId, id: Uuid, error: string): Promise<AutomationRun> {
    return this.transition(tenantId, id, failRun, automationRunFailed, error);
  }

  /** Put back what an automation did, once the capability that would put it back is known to be there. */
  async compensate(tenantId: TenantId, id: Uuid, compensationRef: string): Promise<AutomationRun> {
    const run = await this.require(tenantId, id);
    const capabilityKey = runCompensationCapabilityKey(run);
    if (capabilityKey) {
      await this.requireInvocable(tenantId, capabilityKey, "compensation");
    }
    return this.transition(tenantId, id, compensateRun, automationRunCompensated, compensationRef);
  }

  // --- Reading ---------------------------------------------------------------------

  /** One run, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<AutomationRun> {
    return this.require(tenantId, id);
  }

  /** Everything one rule has ever done — the record a governance review reads a rule by. */
  async listByRule(tenantId: TenantId, ruleId: Uuid): Promise<readonly AutomationRun[]> {
    return this.repository.listByRule(tenantId, ruleId);
  }

  /** Everything any automation has done about one subject. */
  async listBySubject(
    tenantId: TenantId,
    subjectDomain: string,
    subjectId: string,
  ): Promise<readonly AutomationRun[]> {
    return this.repository.listBySubject(tenantId, subjectDomain, subjectId);
  }

  /** The approval queue: firings the gate stopped, waiting on a person. */
  async listAwaitingApproval(tenantId: TenantId): Promise<readonly AutomationRun[]> {
    return this.repository.listAwaitingApproval(tenantId);
  }

  /** Firings that owe the institution a reversal and have not been given one. */
  async listCompensationDue(tenantId: TenantId): Promise<readonly AutomationRun[]> {
    return this.repository.listCompensationDue(tenantId);
  }

  /** Every run in the tenant. */
  async list(tenantId: TenantId): Promise<readonly AutomationRun[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** Fire one rule that has already been loaded and gated, and announce it. */
  private async fireOne(
    rule: AutomationRule,
    params: FireAutomationParams,
    recommendation: RecommendationGateView | null,
  ): Promise<AutomationRun> {
    const run = fireRule(rule, {
      subjectDomain: params.subjectDomain,
      subjectId: params.subjectId,
      facts: params.facts ?? {},
      recommendation,
    });

    await this.repository.save(run);
    await this.emit(automationRunFired(run));
    return run;
  }

  /**
   * The gate's view of the recommendation being acted on, built from what is stored rather than from what a
   * caller says. Null when no recommendation is in play, which is the ordinary case for a signal-driven rule.
   */
  private async gateView(
    tenantId: TenantId,
    recommendationId: Uuid | null | undefined,
  ): Promise<RecommendationGateView | null> {
    if (!recommendationId) {
      return null;
    }
    const recommendation = await this.recommendations.findById(tenantId, recommendationId);
    if (!recommendation) {
      throw new RecommendationNotFoundError(recommendationId);
    }
    return toRecommendationGateView(recommendation);
  }

  /** The run under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<AutomationRun> {
    const run = await this.repository.findById(tenantId, id);
    if (!run) {
      throw new AutomationRunNotFoundError(id);
    }
    return run;
  }

  /** The rule being fired, or a 404 naming it. */
  private async requireRule(tenantId: TenantId, id: Uuid): Promise<AutomationRule> {
    const rule = await this.rules.findById(tenantId, id);
    if (!rule) {
      throw new AutomationRuleNotFoundError(id);
    }
    return rule;
  }

  /** One capability key, checked against the catalog. */
  private async requireInvocable(
    tenantId: TenantId,
    capabilityKey: string,
    role: string,
  ): Promise<void> {
    if (!(await this.capabilities.isInvocable(tenantId, capabilityKey))) {
      throw new CapabilityNotInvocableError(capabilityKey, role);
    }
  }

  /** Load, apply a guarded pure transition, save, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (run: AutomationRun, ...args: TArgs) => AutomationRun,
    announce: (run: AutomationRun) => DomainEvent,
    ...args: TArgs
  ): Promise<AutomationRun> {
    const next = move(await this.require(tenantId, id), ...args);
    await this.repository.save(next);
    await this.emit(announce(next));
    return next;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
