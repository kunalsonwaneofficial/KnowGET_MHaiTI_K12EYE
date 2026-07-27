import type {
  AgentOperationsSummary,
  AgentView,
  ApprovalView,
  InvocationSummaryView,
  InvocationView,
  KeyCount,
  PlanView,
  ToolView,
} from "./ai-view";

/**
 * The metrics engine — a tenant's AI operations described in counts and rates, never in content.
 *
 * Everything here is deliberately *descriptive*. It reports what is registered, what has run, how much needed a
 * human and how much had to be undone. It draws no conclusions and grades no agent: a high approval rate is not
 * evidence that the gates are working, and a low one is not evidence that they are not. Judgement stays with the
 * institution, which is the same reason nothing in this package produces a score.
 *
 * The shapes it returns are safe to emit and to store: keys, statuses and numbers only. No prompt, no reasoning
 * text, no institutional record ever reaches a metric.
 */

/** Percent of `part` in `whole`, 0–100 with two decimals. Zero when there is nothing to be a part of. */
const percent = (part: number, whole: number): number =>
  whole === 0 ? 0 : Math.round((part * 100 * 100) / whole) / 100;

/**
 * Roll a list of keys up into counts, commonest first and alphabetical within a tie — a stable order, so a
 * roll-up can be compared between two runs and asserted on in a test.
 */
export function tally(keys: readonly string[]): readonly KeyCount[] {
  const counts = new Map<string, number>();
  for (const key of keys) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** Plans rolled up by status — what the tenant's plan pipeline currently looks like. */
export const plansByStatus = (plans: readonly PlanView[]): readonly KeyCount[] =>
  tally(plans.map((plan) => plan.status));

/** Plans rolled up by agent — which registered agents are actually being planned with. */
export const plansByAgent = (plans: readonly PlanView[]): readonly KeyCount[] =>
  tally(plans.map((plan) => plan.agentId));

/** Invocations rolled up by capability — which capabilities the runtime actually reaches for. */
export const invocationsByCapability = (
  invocations: readonly InvocationView[],
): readonly KeyCount[] => tally(invocations.map((invocation) => invocation.capabilityKey));

/** Everything the operations summary is computed from, in one bundle rather than six positional arguments. */
export interface AgentOperationsInput {
  readonly agents: readonly AgentView[];
  readonly capabilities: readonly ToolView[];
  readonly plans: readonly PlanView[];
  readonly invocations: readonly InvocationSummaryView[];
  readonly approvals: readonly ApprovalView[];
}

/**
 * Summarize a tenant's AI operations.
 *
 * Two of the rates deserve their definitions stated. `approvalRate` is measured over *decided* requests only —
 * approved as a share of approved plus rejected plus expired — because a request still sitting in someone's
 * queue is not evidence either way, and counting it as a refusal would make a slow approver look like a strict
 * one. `humanGatedRate` is measured over *all* invocations, because the question it answers is how much of the
 * runtime's activity a human actually stood in front of.
 */
export function summarizeAgentOperations(input: AgentOperationsInput): AgentOperationsSummary {
  const { agents, capabilities, plans, invocations, approvals } = input;

  const decided = approvals.filter((approval) => approval.decision !== "pending");
  const approved = decided.filter((approval) => approval.decision === "approved");
  const gated = invocations.filter((invocation) => invocation.approvalRequestId !== null);

  return {
    agentCount: agents.length,
    activeAgentCount: agents.filter((agent) => agent.status === "active").length,
    capabilityCount: capabilities.length,
    planCount: plans.length,
    plansByStatus: plansByStatus(plans),
    invocationCount: invocations.length,
    compensatedInvocationCount: invocations.filter(
      (invocation) => invocation.status === "compensated",
    ).length,
    approvalCount: approvals.length,
    pendingApprovalCount: approvals.filter((approval) => approval.decision === "pending").length,
    approvalRate: percent(approved.length, decided.length),
    humanGatedRate: percent(gated.length, invocations.length),
  };
}
