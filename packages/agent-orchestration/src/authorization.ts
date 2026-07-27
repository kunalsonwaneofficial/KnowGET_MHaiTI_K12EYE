import {
  type AuthorizationOutcome,
  type AuthorizationReason,
  MAX_UNATTENDED_RISK,
  UNATTENDED_EFFECTS,
  isDenyingReason,
  riskRank,
} from "./ai-value";
import type { AgentView, AuthorizationDecision, ToolView } from "./ai-view";

/**
 * The authorization engine — the gate every agent action passes through, and the enforcement point of two of
 * the contract's defining rules.
 *
 * **Agents invoke capabilities, never databases directly.** An agent is granted *capability keys*, and a
 * capability key is the only thing this engine will authorize. There is no vocabulary here for a table, a
 * query, a connection or a statement: an ungranted key is denied, and there is no other door.
 *
 * **Human approval is enforceable.** The engine separates two failures that are usually conflated. A `denied`
 * decision is a *grant* failure — the agent is not active, the capability is not active, or it was never
 * granted — and no approval can rescue it: {@link isExecutable} refuses a denied decision even when a human has
 * approved. A `requires_approval` decision is the human gate itself, and only a real approval opens it.
 *
 * Every decision is pure: the same agent and capability always produce the same verdict, with sorted,
 * de-duplicated reason *codes* rather than prose, so the verdict is safe to store, emit and assert on.
 */

/** Sort reasons into the declared order and drop duplicates, so a decision is deterministic. */
const normalizeReasons = (
  reasons: readonly AuthorizationReason[],
): readonly AuthorizationReason[] => [...new Set(reasons)].sort((a, b) => a.localeCompare(b));

/**
 * Authorize an agent to invoke a capability. Returns the full verdict rather than a boolean: the caller needs
 * to know *why*, whether a human can open the gate, and what undoing it would take.
 *
 * The rules, in order of severity:
 * 1. the agent must be `active`, the capability `active`, and the capability must be granted — else `denied`;
 * 2. the capability's own `requiresApproval` flag, an `irreversible` effect, and a `critical` risk each raise
 *    the human gate regardless of how autonomous the agent is;
 * 3. otherwise the agent's autonomy must permit the capability's *effect* and cover its *risk*, or the gate
 *    rises.
 */
export function authorizeInvocation(agent: AgentView, tool: ToolView): AuthorizationDecision {
  const reasons: AuthorizationReason[] = [];

  if (agent.status !== "active") {
    reasons.push("agent_not_active");
  }
  if (tool.status !== "active") {
    reasons.push("tool_not_active");
  }
  if (!agent.grantedCapabilityKeys.includes(tool.key)) {
    reasons.push("capability_not_granted");
  }

  if (tool.requiresApproval) {
    reasons.push("tool_requires_approval");
  }
  if (tool.reversibility === "irreversible") {
    reasons.push("irreversible_action");
  }

  const unattendedEffects = UNATTENDED_EFFECTS[agent.autonomyLevel];
  const ceiling = MAX_UNATTENDED_RISK[agent.autonomyLevel];
  if (ceiling === null || unattendedEffects.length === 0) {
    reasons.push("autonomy_forbids_unattended_execution");
  } else {
    if (!unattendedEffects.includes(tool.effect)) {
      reasons.push("effect_exceeds_autonomy");
    }
    if (riskRank(tool.riskLevel) > riskRank(ceiling)) {
      reasons.push("risk_exceeds_autonomy");
    }
  }

  const normalized = normalizeReasons(reasons);
  const outcome: AuthorizationOutcome = normalized.some(isDenyingReason)
    ? "denied"
    : normalized.length > 0
      ? "requires_approval"
      : "allowed";

  return {
    agentId: agent.id,
    capabilityKey: tool.key,
    outcome,
    reasons: normalized,
    riskLevel: tool.riskLevel,
    reversibility: tool.reversibility,
    requiresCompensation: tool.reversibility !== "reversible",
  };
}

/**
 * Whether a decision may actually execute, given whether a human has approved. This is the enforceable part of
 * "enforceable human approval": an `allowed` decision runs, a `requires_approval` decision runs **only** with an
 * approval, and a `denied` decision never runs — an approval is not a grant.
 */
export const isExecutable = (decision: AuthorizationDecision, hasApproval: boolean): boolean =>
  decision.outcome === "allowed" || (decision.outcome === "requires_approval" && hasApproval);

/** Whether the decision opened without needing a human at all. */
export const isAllowedUnattended = (decision: AuthorizationDecision): boolean =>
  decision.outcome === "allowed";

/** Whether a human must decide before this can run. */
export const requiresHumanApproval = (decision: AuthorizationDecision): boolean =>
  decision.outcome === "requires_approval";

/** The reasons that caused an outright denial — empty unless the decision was `denied`. */
export const denyingReasons = (decision: AuthorizationDecision): readonly AuthorizationReason[] =>
  decision.reasons.filter(isDenyingReason);

/**
 * Authorize a whole set of capabilities for one agent at once — what plan inspection needs, and what an agent's
 * "what can you actually do" view is built from. Order follows the capabilities given.
 */
export const authorizeAll = (
  agent: AgentView,
  tools: readonly ToolView[],
): readonly AuthorizationDecision[] => tools.map((tool) => authorizeInvocation(agent, tool));

/** The capability keys an agent can invoke with no human involved at all. */
export const unattendedCapabilities = (
  agent: AgentView,
  tools: readonly ToolView[],
): readonly string[] =>
  authorizeAll(agent, tools)
    .filter(isAllowedUnattended)
    .map((decision) => decision.capabilityKey);
