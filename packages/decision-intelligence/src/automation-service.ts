import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import type { ActionView } from "./decision-view";
import {
  ruleActivated,
  ruleAmended,
  ruleDrafted,
  rulePaused,
  ruleRetired,
} from "./decision-events";
import {
  type ActivateRuleParams,
  type AmendAutomationRuleParams,
  type AutomationCondition,
  type AutomationRule,
  type CreateAutomationRuleParams,
  type SignalFacts,
  activateRule,
  addCondition,
  amendAutomationRule,
  createAutomationRule,
  isRuleEditable,
  matchingRules,
  pauseRule,
  removeConditions,
  retireRule,
} from "./automation-rule";
import {
  ActiveRuleImmutableError,
  AutomationRuleNotFoundError,
  CapabilityNotInvocableError,
  DuplicateRuleKeyError,
  OrganizationNotFoundForDecisionError,
} from "./errors";
import type { AutomationRuleRepository, CapabilityDirectory, OrganizationDirectory } from "./ports";

/**
 * Application service for automation rules — the standing instructions an institution leaves running.
 *
 * A rule is the one thing in this domain that acts with nobody present, and that changes what the checks here
 * are for. Everywhere else, a capability that has gone missing produces an error somebody is standing in front
 * of. A rule pointing at a missing capability fails at three in the morning, on a Sunday, against a student's
 * record, and the first anyone hears of it is a report that does not add up. So both of a rule's capabilities —
 * what it would invoke and what would undo it — are checked when the rule is drafted, checked again on every
 * amendment that touches the action, and checked once more at activation, which is the moment the rule gains
 * the standing to act unattended.
 *
 * The autonomy gate itself is the aggregate's: `activateRule` refuses a rule the engine would block outright,
 * and reports the reasons. That is the contract's first rule at the only point where it can still be argued
 * with cheaply. Uniqueness of the rule key lives here, because an aggregate cannot see its siblings.
 */
export interface AutomationServiceDeps {
  readonly repository: AutomationRuleRepository;
  readonly organizations: OrganizationDirectory;
  readonly capabilities: CapabilityDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class AutomationService {
  private readonly repository: AutomationRuleRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly capabilities: CapabilityDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AutomationServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.capabilities = deps.capabilities;
    this.events = deps.events;
  }

  // --- Authoring -------------------------------------------------------------------

  /** Draft a rule. Always `draft` — nothing that goes in here can produce something that already fires. */
  async draft(input: CreateAutomationRuleParams): Promise<AutomationRule> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForDecisionError(input.organizationId);
    }

    const rule = createAutomationRule(input);
    const clash = await this.repository.findByKey(rule.tenantId, rule.key);
    if (clash) {
      throw new DuplicateRuleKeyError(rule.key);
    }
    await this.requireActionInvocable(rule.tenantId, rule.action);

    await this.repository.save(rule);
    await this.emit(ruleDrafted(rule));
    return rule;
  }

  /** Change a rule that is not currently firing. A new action is checked before it is accepted. */
  async amend(
    tenantId: TenantId,
    id: Uuid,
    params: AmendAutomationRuleParams,
  ): Promise<AutomationRule> {
    if (params.action) {
      await this.requireActionInvocable(tenantId, params.action);
    }
    return this.transition(tenantId, id, amendAutomationRule, ruleAmended, params);
  }

  /** Narrow when the rule fires by one more fact. */
  async addCondition(
    tenantId: TenantId,
    id: Uuid,
    condition: AutomationCondition,
  ): Promise<AutomationRule> {
    return this.transition(tenantId, id, addCondition, ruleAmended, condition);
  }

  /** Drop every condition on one fact. */
  async removeConditions(tenantId: TenantId, id: Uuid, key: string): Promise<AutomationRule> {
    return this.transition(tenantId, id, removeConditions, ruleAmended, key);
  }

  // --- Lifecycle -------------------------------------------------------------------

  /**
   * Turn the rule on, if the autonomy engine will have it and its capabilities are still there.
   *
   * The capability re-check matters more here than anywhere: a draft can sit for weeks between being written
   * and being armed, and this is the last moment before the rule starts acting on its own.
   */
  async activate(
    tenantId: TenantId,
    id: Uuid,
    params: ActivateRuleParams = {},
  ): Promise<AutomationRule> {
    const rule = await this.require(tenantId, id);
    await this.requireActionInvocable(tenantId, rule.action);
    return this.transition(tenantId, id, activateRule, ruleActivated, params);
  }

  /** Stop it firing, without giving it up. */
  async pause(tenantId: TenantId, id: Uuid): Promise<AutomationRule> {
    return this.transition(tenantId, id, pauseRule, rulePaused);
  }

  /** Give it up for good. */
  async retire(tenantId: TenantId, id: Uuid): Promise<AutomationRule> {
    return this.transition(tenantId, id, retireRule, ruleRetired);
  }

  /**
   * Delete a rule that is not live.
   *
   * Bounded to what the aggregate calls editable — a draft or a paused rule. An active rule has to be paused
   * first, deliberately: deleting something mid-flight is how an institution loses track of what was running,
   * and a retired rule is kept because the runs it fired point at it.
   */
  async discard(tenantId: TenantId, id: Uuid): Promise<void> {
    const rule = await this.require(tenantId, id);
    if (!isRuleEditable(rule)) {
      throw new ActiveRuleImmutableError(rule.id, rule.status);
    }
    await this.repository.remove(tenantId, id);
  }

  // --- Reading ---------------------------------------------------------------------

  /** One rule, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<AutomationRule> {
    return this.require(tenantId, id);
  }

  /** The rule under this key, if there is one. */
  async findByKey(tenantId: TenantId, key: string): Promise<AutomationRule | null> {
    return this.repository.findByKey(tenantId, key);
  }

  /** The active rules listening for one signal. */
  async listBySignal(tenantId: TenantId, signalKey: string): Promise<readonly AutomationRule[]> {
    return this.repository.listBySignal(tenantId, signalKey);
  }

  /**
   * The rules a signal carrying these facts would actually fire — the candidate set, evaluated but not acted
   * on. What an administrator asks before arming something, and what the run service asks before firing.
   */
  async matching(
    tenantId: TenantId,
    signalKey: string,
    facts: SignalFacts,
  ): Promise<readonly AutomationRule[]> {
    const listening = await this.repository.listBySignal(tenantId, signalKey);
    return matchingRules(listening, signalKey, facts);
  }

  /** Every rule in the tenant, whatever its status. */
  async list(tenantId: TenantId): Promise<readonly AutomationRule[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The rule under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<AutomationRule> {
    const rule = await this.repository.findById(tenantId, id);
    if (!rule) {
      throw new AutomationRuleNotFoundError(id);
    }
    return rule;
  }

  /**
   * Both halves of an action, checked against the catalog. A `start_workflow` target is a workflow key rather
   * than a capability key, so only an invocation's target is checked here.
   */
  private async requireActionInvocable(tenantId: TenantId, action: ActionView): Promise<void> {
    if (action.kind === "invoke_capability" && action.targetKey) {
      await this.requireInvocable(tenantId, action.targetKey, "action");
    }
    if (action.compensationKey) {
      await this.requireInvocable(tenantId, action.compensationKey, "compensation");
    }
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
    move: (rule: AutomationRule, ...args: TArgs) => AutomationRule,
    announce: (rule: AutomationRule) => DomainEvent,
    ...args: TArgs
  ): Promise<AutomationRule> {
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
