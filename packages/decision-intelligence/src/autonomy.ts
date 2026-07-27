import {
  type AutonomyDisposition,
  type AutonomyReason,
  autonomyModeRank,
  isActingActionKind,
  isBlockingAutonomyReason,
  isOpenRecommendationStatus,
  isWithinAutoExecutionRisk,
} from "./decision-value";
import type { AutomationRuleView, AutonomyDecision, RecommendationGateView } from "./decision-view";

/**
 * The autonomy engine — the gate every automated action passes through, and the enforcement point of two of
 * the contract's three defining rules.
 *
 * **Only low-risk actions auto-execute; high-risk actions require human approval.** The ceiling is
 * `AUTO_EXECUTION_RISK_CEILING`, it is `low`, and it lives in the value module as a platform constant rather
 * than a tenant setting — this engine reads it through `isWithinAutoExecutionRisk` and takes no policy argument
 * that could raise it, so there is no configuration, migration or seeded row that can turn a `high`-risk action
 * into an unattended one.
 *
 * **Automation carries rollback/compensation.** A rule that would carry out a state-changing action is
 * *blocked* — not merely gated — when that action is irreversible, or when it is compensatable but names
 * nothing that would compensate it. `blocked` rather than `requires_approval` is the deliberate part: asking a
 * person to approve a standing unattended rule whose effects can never be recalled is not a decision worth
 * offering. The human path for a genuinely irreversible act is a specific, individually-approved invocation
 * through the AI runtime (P2-D26), where a person owns that one act rather than an open-ended licence.
 *
 * Two asymmetries in the rules are intentional and worth stating plainly:
 *
 * - The risk ceiling and the compensation rule apply to *acting* action kinds only. Raising a recommendation
 *   changes no institutional state, so a rule may raise one about a `critical`, irreversible action entirely
 *   unattended — that is precisely the behaviour the contract wants, because the alternative is a human never
 *   being told. The risk of the recommended action then gates the *decision*, not the raising of it.
 * - The compensation rule binds any mode above `propose_only`, including `auto_with_approval`. A rule that will
 *   perform the action once a human says yes must still be able to say how it would be undone; only a rule that
 *   never performs the action at all is exempt.
 *
 * Every decision is pure: the same rule always produces the same verdict, with sorted, de-duplicated reason
 * *codes* rather than prose, so the verdict is safe to store, emit and assert on.
 */

/** Sort reasons into a stable order and drop duplicates, so a decision is deterministic. */
const normalizeReasons = (reasons: readonly AutonomyReason[]): readonly AutonomyReason[] =>
  [...new Set(reasons)].sort((a, b) => a.localeCompare(b));

/** Whether the way back from this action is actually declared. */
const hasDeclaredCompensation = (rule: AutomationRuleView): boolean =>
  rule.action.reversibility === "reversible" ||
  (rule.action.reversibility === "compensatable" && rule.action.compensationKey !== null);

/**
 * Whether this rule would ever carry out the action itself. `propose_only` never does — it raises a
 * recommendation and a person decides — so the compensation rule does not bind it.
 */
const carriesTheAction = (rule: AutomationRuleView): boolean =>
  isActingActionKind(rule.action.kind) &&
  autonomyModeRank(rule.autonomyMode) > autonomyModeRank("propose_only");

/** Turn a set of reasons into the disposition they imply. Blocking beats gating; no reasons means unattended. */
const dispositionFor = (reasons: readonly AutonomyReason[]): AutonomyDisposition =>
  reasons.some(isBlockingAutonomyReason)
    ? "blocked"
    : reasons.length > 0
      ? "requires_approval"
      : "auto_execute";

/** Assemble the verdict once the reasons are known. */
const decide = (rule: AutomationRuleView, reasons: readonly AutonomyReason[]): AutonomyDecision => {
  const normalized = normalizeReasons(reasons);
  return {
    ruleId: rule.id,
    targetKey: rule.action.targetKey,
    disposition: dispositionFor(normalized),
    reasons: normalized,
    riskLevel: rule.action.riskLevel,
    reversibility: rule.action.reversibility,
    requiresCompensation: rule.action.reversibility !== "reversible",
    compensationAvailable: hasDeclaredCompensation(rule),
  };
};

/**
 * The reasons a rule alone produces, before any recommendation is considered. Shared by both entry points so
 * that gating a recommendation can never be *weaker* than gating the bare rule.
 */
function ruleReasons(rule: AutomationRuleView): readonly AutonomyReason[] {
  const reasons: AutonomyReason[] = [];

  if (rule.status !== "active") {
    reasons.push("rule_not_active");
  }

  if (carriesTheAction(rule)) {
    if (rule.action.reversibility === "irreversible") {
      reasons.push("irreversible_action");
    } else if (!hasDeclaredCompensation(rule)) {
      reasons.push("compensation_not_declared");
    }
  }

  if (rule.autonomyMode !== "auto_execute") {
    reasons.push("mode_forbids_auto_execution");
  }

  if (isActingActionKind(rule.action.kind) && !isWithinAutoExecutionRisk(rule.action.riskLevel)) {
    reasons.push("risk_exceeds_auto_execution_ceiling");
  }

  return reasons;
}

/**
 * Classify what an automation rule may do when it fires. Returns the full verdict rather than a boolean,
 * because the caller needs to know *why*, whether a human can open the gate at all, and what undoing it would
 * take.
 */
export function classifyAction(rule: AutomationRuleView): AutonomyDecision {
  return decide(rule, ruleReasons(rule));
}

/**
 * Classify a rule acting on a specific recommendation. Everything the rule alone would produce still applies,
 * and three further reasons can only be seen here: the recommendation has already been answered, its evidence
 * chain is not sound, or its subject was declared to belong to a person.
 *
 * This is where the contract's second rule feeds its first. An ungrounded recommendation is *blocked*, not
 * gated — a person asked to approve an action whose justification does not hold up is being asked to launder
 * it, and the fix is to ground the recommendation rather than to click through.
 */
export function classifyRecommendedAction(
  rule: AutomationRuleView,
  recommendation: RecommendationGateView,
): AutonomyDecision {
  const reasons: AutonomyReason[] = [...ruleReasons(rule)];

  if (!isOpenRecommendationStatus(recommendation.status)) {
    reasons.push("recommendation_not_open");
  }
  if (!recommendation.grounded) {
    reasons.push("evidence_missing");
  }
  if (recommendation.requiresHumanJudgement) {
    reasons.push("subject_requires_human_judgement");
  }

  return decide(rule, reasons);
}

/** Whether the gate opened with no person involved at all. */
export const isAutoExecutable = (decision: AutonomyDecision): boolean =>
  decision.disposition === "auto_execute";

/** Whether a human must decide before this can happen. */
export const requiresHumanApproval = (decision: AutonomyDecision): boolean =>
  decision.disposition === "requires_approval";

/** Whether the action may not proceed at all, with or without a human. */
export const isBlocked = (decision: AutonomyDecision): boolean =>
  decision.disposition === "blocked";

/** The reasons that caused an outright block — empty unless the decision was `blocked`. */
export const blockingReasons = (decision: AutonomyDecision): readonly AutonomyReason[] =>
  decision.reasons.filter(isBlockingAutonomyReason);

/**
 * Whether the action may actually proceed, given whether a human has approved. This is the enforceable half of
 * the gate: an `auto_execute` decision proceeds, a `requires_approval` decision proceeds **only** with an
 * approval, and a `blocked` decision never proceeds — an approval is not a repair.
 */
export const mayProceed = (decision: AutonomyDecision, hasApproval: boolean): boolean =>
  decision.disposition === "auto_execute" ||
  (decision.disposition === "requires_approval" && hasApproval);

/** Classify a whole set of rules at once. Order follows the rules given. */
export const classifyAll = (rules: readonly AutomationRuleView[]): readonly AutonomyDecision[] =>
  rules.map(classifyAction);

/** The rules that can fire with no human involved at all — an institution's true unattended surface. */
export const autoExecutableRules = (rules: readonly AutomationRuleView[]): readonly string[] =>
  classifyAll(rules)
    .filter(isAutoExecutable)
    .map((decision) => decision.ruleId);

/** The rules that would stop for a person, and the rules that cannot fire at all, split for an operator view. */
export const partitionByDisposition = (
  rules: readonly AutomationRuleView[],
): Readonly<Record<AutonomyDisposition, readonly string[]>> => {
  const decisions = classifyAll(rules);
  return {
    auto_execute: decisions.filter(isAutoExecutable).map((d) => d.ruleId),
    requires_approval: decisions.filter(requiresHumanApproval).map((d) => d.ruleId),
    blocked: decisions.filter(isBlocked).map((d) => d.ruleId),
  };
};
