import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { blockingReasons, classifyAction } from "./autonomy";
import {
  type ActionKind,
  type AutonomyDisposition,
  type AutonomyMode,
  type AutonomyReason,
  type ConditionOperator,
  type Reversibility,
  type RiskLevel,
  type RuleStatus,
  isActingActionKind,
  normalizeCapabilityKey,
  normalizeRuleKey,
  normalizeSignalKey,
  normalizeWorkflowKey,
} from "./decision-value";
import type { ActionView, AutomationRuleView, AutonomyDecision } from "./decision-view";
import {
  ActionTargetNotAllowedError,
  ActionTargetRequiredError,
  ActiveRuleImmutableError,
  ConditionArityError,
  EmptyConditionKeyError,
  EmptyRuleKeyError,
  EmptyRuleNameError,
  EmptyRuleSignalKeyError,
  InvalidRuleTransitionError,
  UnsafeAutomationRuleError,
} from "./errors";

/**
 * A standing automation rule: when this signal arrives and these conditions hold, request this action, this far
 * unattended.
 *
 * A rule is the most dangerous object in the contract, because it is the only one that acts without anybody
 * present. Everything structural about this aggregate follows from that.
 *
 * **Activation is the gate.** {@link activateRule} asks the autonomy engine what this rule would be permitted to
 * do *as if it were already live*, and refuses to turn it on if the answer contains a reason no human approval
 * can repair — an irreversible action, or a compensatable one that names nothing to compensate it. That is the
 * contract's third rule made unavoidable at the only moment it can be: before the rule is capable of firing. A
 * rule may be **drafted** in that state deliberately, so its author can read back exactly what is wrong with it;
 * it may never be switched on in it.
 *
 * **An active rule is not edited underneath the people accountable for it.** {@link amendAutomationRule} refuses
 * on an active rule. Changing what an unattended rule does means pausing it, changing it, and putting it back
 * through the activation gate — the same gate the first version passed, applied to the version that will
 * actually run.
 *
 * **Conditions are data, never code.** The operator grammar is closed and tiny, each operator's arity is fixed
 * and checked when the condition is written, and {@link conditionsSatisfiedBy} is a finite comparison table over
 * declared facts. There is no expression to compile, no script host, and no path anywhere in this package that
 * turns a stored string into behaviour. A fact the rule was not given satisfies nothing — including the negative
 * operators — because a rule firing on the *absence* of information is a rule firing on not having looked.
 *
 * `draft → active ⇄ paused → retired`, and retired is terminal. The rule does not count its own firings: every
 * firing is an {@link AutomationRun}, and a second copy of that count here would be a second version of it.
 */

// --- Conditions ------------------------------------------------------------------

/**
 * One comparison a rule makes against the facts a signal carries. `values` are the operands, always as text —
 * this domain stores the comparison, it does not own the type system of every domain it can watch.
 */
export interface AutomationCondition {
  /** The fact being examined, normalized the way signal keys are. */
  readonly key: string;
  readonly operator: ConditionOperator;
  /** Empty for `exists`, exactly one for the comparisons, one or more for `in` and `not_in`. */
  readonly values: readonly string[];
}

export interface DeclareConditionParams {
  readonly key: string;
  readonly operator: ConditionOperator;
  readonly values?: readonly string[];
}

/** The operators that take a list rather than a single operand. */
const LIST_OPERATORS: readonly ConditionOperator[] = ["in", "not_in"];

/** Trim, drop blanks and de-duplicate, so a condition's shape does not depend on how it was typed in. */
const normalizeValues = (values: readonly string[] | undefined): readonly string[] => [
  ...new Set((values ?? []).map((value) => value.trim()).filter((value) => value.length > 0)),
];

/** Enforce the fixed arity of the operator, so an ill-formed condition is refused where it is written. */
function requireArity(operator: ConditionOperator, values: readonly string[]): readonly string[] {
  if (operator === "exists") {
    if (values.length !== 0) {
      throw new ConditionArityError(operator, "no", values.length);
    }
    return values;
  }
  if (LIST_OPERATORS.includes(operator)) {
    if (values.length === 0) {
      throw new ConditionArityError(operator, "at least one", values.length);
    }
    return values;
  }
  if (values.length !== 1) {
    throw new ConditionArityError(operator, "exactly one", values.length);
  }
  return values;
}

/** Declare a condition, normalized and checked for arity. */
export function declareCondition(params: DeclareConditionParams): AutomationCondition {
  const key = normalizeSignalKey(params.key);
  if (key.length === 0) {
    throw new EmptyConditionKeyError();
  }

  return {
    key,
    operator: params.operator,
    values: requireArity(params.operator, normalizeValues(params.values)),
  };
}

// --- Actions ---------------------------------------------------------------------

export interface DeclareActionParams {
  readonly kind: ActionKind;
  readonly targetKey?: string | null;
  readonly riskLevel: RiskLevel;
  readonly reversibility: Reversibility;
  readonly compensationKey?: string | null;
}

/** Normalize a target the way its own contract names it: a capability key, or one of this domain's workflows. */
const normalizeTargetKey = (kind: ActionKind, targetKey: string): string =>
  kind === "start_workflow" ? normalizeWorkflowKey(targetKey) : normalizeCapabilityKey(targetKey);

/**
 * Declare what a rule would request. An acting kind must name what it acts on; raising a recommendation must
 * not, because it acts on nothing — it puts a proposal in front of a person.
 *
 * A compensatable action with no compensation key is *allowed here* and refused at activation. The distinction
 * matters: an author needs to be able to write the rule down and be told precisely why it cannot be turned on.
 */
export function declareAction(params: DeclareActionParams): ActionView {
  const declared = (params.targetKey ?? "").trim();

  if (isActingActionKind(params.kind)) {
    if (declared.length === 0) {
      throw new ActionTargetRequiredError(params.kind);
    }
  } else if (declared.length > 0) {
    throw new ActionTargetNotAllowedError(params.kind);
  }

  const compensationKey = normalizeCapabilityKey(params.compensationKey ?? "");

  return {
    kind: params.kind,
    targetKey: declared.length === 0 ? null : normalizeTargetKey(params.kind, declared),
    riskLevel: params.riskLevel,
    reversibility: params.reversibility,
    compensationKey: compensationKey.length === 0 ? null : compensationKey,
  };
}

// --- The aggregate ---------------------------------------------------------------

export interface AutomationRule {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** Unique within the organization. */
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  /** The signal this rule watches for. */
  readonly signalKey: string;
  /** Every condition must hold for the rule to match. An empty list matches the bare signal. */
  readonly conditions: readonly AutomationCondition[];
  readonly action: ActionView;
  readonly autonomyMode: AutonomyMode;
  readonly status: RuleStatus;
  readonly createdByUserId: string | null;
  readonly activatedAt: ISODateString | null;
  /** The person who last turned this rule on — the institution's answer to "who allowed this to run". */
  readonly activatedByUserId: string | null;
  readonly pausedAt: ISODateString | null;
  readonly retiredAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateAutomationRuleParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly key: string;
  readonly name: string;
  readonly description?: string | null;
  readonly signalKey: string;
  readonly conditions?: readonly AutomationCondition[];
  readonly action: ActionView;
  readonly autonomyMode: AutonomyMode;
  readonly createdByUserId?: string | null;
}

/** Draft a rule. Always `draft`: nothing this function is given can produce a rule that already fires. */
export function createAutomationRule(params: CreateAutomationRuleParams): AutomationRule {
  const key = normalizeRuleKey(params.key);
  if (key.length === 0) {
    throw new EmptyRuleKeyError();
  }

  const name = params.name.trim();
  if (name.length === 0) {
    throw new EmptyRuleNameError();
  }

  const signalKey = normalizeSignalKey(params.signalKey);
  if (signalKey.length === 0) {
    throw new EmptyRuleSignalKeyError();
  }

  const timestamp = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    key,
    name,
    description: params.description?.trim() || null,
    signalKey,
    conditions: [...(params.conditions ?? [])],
    action: params.action,
    autonomyMode: params.autonomyMode,
    status: "draft",
    createdByUserId: params.createdByUserId?.trim() || null,
    activatedAt: null,
    activatedByUserId: null,
    pausedAt: null,
    retiredAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

// --- Editing ---------------------------------------------------------------------

const touch = (rule: AutomationRule, patch: Partial<AutomationRule>): AutomationRule => ({
  ...rule,
  ...patch,
  updatedAt: nowIso(),
});

/** A rule is changed while it is not firing. See the module comment for why that is structural. */
function requireEditable(rule: AutomationRule): void {
  if (rule.status === "active" || rule.status === "retired") {
    throw new ActiveRuleImmutableError(rule.id, rule.status);
  }
}

export interface AmendAutomationRuleParams {
  readonly name?: string;
  readonly description?: string | null;
  readonly signalKey?: string;
  readonly conditions?: readonly AutomationCondition[];
  readonly action?: ActionView;
  readonly autonomyMode?: AutonomyMode;
}

/** Change a rule that is not currently firing. */
export function amendAutomationRule(
  rule: AutomationRule,
  params: AmendAutomationRuleParams,
): AutomationRule {
  requireEditable(rule);

  const name = params.name === undefined ? rule.name : params.name.trim();
  if (name.length === 0) {
    throw new EmptyRuleNameError();
  }

  const signalKey =
    params.signalKey === undefined ? rule.signalKey : normalizeSignalKey(params.signalKey);
  if (signalKey.length === 0) {
    throw new EmptyRuleSignalKeyError();
  }

  return touch(rule, {
    name,
    description:
      params.description === undefined ? rule.description : params.description?.trim() || null,
    signalKey,
    conditions: params.conditions === undefined ? rule.conditions : [...params.conditions],
    action: params.action ?? rule.action,
    autonomyMode: params.autonomyMode ?? rule.autonomyMode,
  });
}

/** Add one condition to a rule that is not currently firing. */
export const addCondition = (
  rule: AutomationRule,
  condition: AutomationCondition,
): AutomationRule => amendAutomationRule(rule, { conditions: [...rule.conditions, condition] });

/** Drop every condition on the named fact from a rule that is not currently firing. */
export const removeConditions = (rule: AutomationRule, key: string): AutomationRule => {
  const normalized = normalizeSignalKey(key);
  return amendAutomationRule(rule, {
    conditions: rule.conditions.filter((condition) => condition.key !== normalized),
  });
};

// --- Lifecycle -------------------------------------------------------------------

/**
 * Judge the rule as if it were already live. Without forcing the status, every draft would be reported blocked
 * for the one reason activation is about to fix, and the genuine objections would be lost behind it.
 */
const asIfActive = (rule: AutomationRule): AutomationRuleView => ({
  ...toAutomationRuleView(rule),
  status: "active",
});

export interface ActivateRuleParams {
  readonly activatedByUserId?: string | null;
}

/**
 * Turn the rule on, if the autonomy engine will have it. This is the activation gate described in the module
 * comment: reasons that only a human gate would raise are fine here — the rule will simply stop for a person —
 * but a reason that blocks outright means no approval would ever make this rule safe to leave running.
 */
export function activateRule(
  rule: AutomationRule,
  params: ActivateRuleParams = {},
): AutomationRule {
  if (rule.status === "active" || rule.status === "retired") {
    throw new InvalidRuleTransitionError(rule.status, "active");
  }

  const blocking = blockingReasons(classifyAction(asIfActive(rule)));
  if (blocking.length > 0) {
    throw new UnsafeAutomationRuleError(rule.id, blocking);
  }

  return touch(rule, {
    status: "active",
    activatedAt: nowIso(),
    activatedByUserId: params.activatedByUserId?.trim() || null,
  });
}

/** Stop the rule firing without discarding it. Reversible — this is how an active rule becomes editable. */
export function pauseRule(rule: AutomationRule): AutomationRule {
  if (rule.status !== "active") {
    throw new InvalidRuleTransitionError(rule.status, "paused");
  }
  return touch(rule, { status: "paused", pausedAt: nowIso() });
}

/** Retire the rule for good. Terminal: a retired rule cannot be brought back, only superseded by a new one. */
export function retireRule(rule: AutomationRule): AutomationRule {
  if (rule.status === "retired") {
    throw new InvalidRuleTransitionError(rule.status, "retired");
  }
  return touch(rule, { status: "retired", retiredAt: nowIso() });
}

// --- Matching --------------------------------------------------------------------

/** The facts a signal carries, keyed the way conditions name them. */
export type SignalFacts = Readonly<Record<string, unknown>>;

/** Index the facts under normalized keys, so a condition matches however the emitter spelled it. */
const normalizeFacts = (facts: SignalFacts): ReadonlyMap<string, unknown> =>
  new Map(Object.entries(facts).map(([key, value]) => [normalizeSignalKey(key), value]));

/** A fact as text, or null when it is absent or is not a scalar this closed grammar can compare. */
const factText = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
};

/** Compare two operands numerically, failing closed when either side is not a finite number. */
const compareNumbers = (
  left: string,
  right: string,
  satisfied: (a: number, b: number) => boolean,
): boolean => {
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && satisfied(a, b);
};

/**
 * Evaluate one condition against the facts. A finite comparison table, not an evaluator: every branch is a
 * literal operator of the closed grammar, and an operand is only ever compared, never executed.
 *
 * A fact that is absent satisfies nothing, negative operators included. `not_equals` on a fact the signal never
 * carried would otherwise read as "this is definitely not that", which is a claim the rule has no basis for.
 */
export function evaluateCondition(condition: AutomationCondition, facts: SignalFacts): boolean {
  const raw = normalizeFacts(facts).get(condition.key);

  if (condition.operator === "exists") {
    return raw !== null && raw !== undefined;
  }

  const actual = factText(raw);
  if (actual === null) {
    return false;
  }

  const first = condition.values[0] ?? "";
  switch (condition.operator) {
    case "equals":
      return actual === first;
    case "not_equals":
      return actual !== first;
    case "greater_than":
      return compareNumbers(actual, first, (a, b) => a > b);
    case "less_than":
      return compareNumbers(actual, first, (a, b) => a < b);
    case "in":
      return condition.values.includes(actual);
    case "not_in":
      return !condition.values.includes(actual);
  }
}

/** Whether every condition holds. An unconditional rule matches the bare signal, which is a real rule. */
export const conditionsSatisfiedBy = (rule: AutomationRule, facts: SignalFacts): boolean =>
  rule.conditions.every((condition) => evaluateCondition(condition, facts));

/** The conditions that did not hold, so an operator can see why a rule they expected to fire did not. */
export const unsatisfiedConditionKeys = (
  rule: AutomationRule,
  facts: SignalFacts,
): readonly string[] =>
  rule.conditions
    .filter((condition) => !evaluateCondition(condition, facts))
    .map((condition) => condition.key);

/** Whether this rule is listening for this signal at all. A rule that is not active listens for nothing. */
export const ruleFiresOn = (rule: AutomationRule, signalKey: string): boolean =>
  isRuleActive(rule) && rule.signalKey === normalizeSignalKey(signalKey);

/** Whether this signal, carrying these facts, matches this rule. */
export const ruleMatches = (rule: AutomationRule, signalKey: string, facts: SignalFacts): boolean =>
  ruleFiresOn(rule, signalKey) && conditionsSatisfiedBy(rule, facts);

/** The rules that match, in the order given — the candidate set one signal produces. */
export const matchingRules = (
  rules: readonly AutomationRule[],
  signalKey: string,
  facts: SignalFacts,
): readonly AutomationRule[] => rules.filter((rule) => ruleMatches(rule, signalKey, facts));

// --- Reading ---------------------------------------------------------------------

/** Whether the rule is firing right now. */
export const isRuleActive = (rule: AutomationRule): boolean => rule.status === "active";

/** Whether the rule may be changed. */
export const isRuleEditable = (rule: AutomationRule): boolean =>
  rule.status === "draft" || rule.status === "paused";

/** The distinct facts this rule examines, in the order it examines them. */
export const ruleConditionKeys = (rule: AutomationRule): readonly string[] => [
  ...new Set(rule.conditions.map((condition) => condition.key)),
];

/** One fact as it stood when a rule was matched against it. */
export interface ObservedFact {
  readonly key: string;
  /** The value as text, or null when the signal did not carry it. */
  readonly value: string | null;
}

/**
 * What the rule actually looked at, for the record a firing leaves behind.
 *
 * Deliberately only the facts this rule examines — never the whole signal payload. A firing has to be
 * explainable months later, and the honest minimum for that is the operands of the comparisons that were made.
 * Keeping the rest would be this contract quietly accumulating copies of other domains' records.
 */
export const observeFacts = (rule: AutomationRule, facts: SignalFacts): readonly ObservedFact[] => {
  const indexed = normalizeFacts(facts);
  return ruleConditionKeys(rule).map((key) => ({ key, value: factText(indexed.get(key)) }));
};

// --- Engine views ----------------------------------------------------------------

/** The autonomy engine's view. */
export const toAutomationRuleView = (rule: AutomationRule): AutomationRuleView => ({
  id: rule.id,
  key: rule.key,
  status: rule.status,
  autonomyMode: rule.autonomyMode,
  action: rule.action,
});

/** What the autonomy gate says about this rule as it currently stands. */
export const classifyRuleAction = (rule: AutomationRule): AutonomyDecision =>
  classifyAction(toAutomationRuleView(rule));

/** How far this rule may go on its own. */
export const ruleAutonomyDisposition = (rule: AutomationRule): AutonomyDisposition =>
  classifyRuleAction(rule).disposition;

/** Why the rule cannot fire at all, if it cannot — the objections activation would refuse. */
export const ruleBlockingReasons = (rule: AutomationRule): readonly AutonomyReason[] =>
  blockingReasons(classifyAction(asIfActive(rule)));
