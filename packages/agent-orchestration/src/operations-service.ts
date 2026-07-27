import type { TenantId } from "@knowget/types";
import type { AgentOperationsSummary, KeyCount } from "./ai-view";
import { toAgentView } from "./agent";
import { toPlanView } from "./execution-plan";
import {
  invocationsByCapability,
  plansByAgent,
  plansByStatus,
  summarizeAgentOperations,
} from "./metrics";
import { toApprovalView } from "./approval-request";
import { toToolView } from "./tool";
import { toInvocationSummaryView, toInvocationView } from "./tool-invocation";
import type {
  AgentRepository,
  ApprovalRequestRepository,
  ExecutionPlanRepository,
  ToolInvocationRepository,
  ToolRepository,
} from "./ports";

/**
 * Read-only application service over the AI operating system's own activity — what a tenant's runtime looks like
 * from above.
 *
 * It writes nothing, emits nothing, and holds no state. Every method is the same shape: read the records this
 * tenant owns, narrow them to the metrics engine's views, and let the engine do the arithmetic. That narrowing is
 * the point rather than an implementation detail. The views carry keys, statuses and ids only, so no goal, no
 * reasoning, no prompt and no institutional record can reach a figure here — which is what makes these numbers
 * safe to put on a dashboard, hand to an auditor, or send to somebody who is not entitled to read the underlying
 * work at all.
 *
 * The engine grades nothing and neither does this service. A high approval rate is not proof that the gates are
 * working and a low one is not proof that they are not; both are facts about the institution, and the institution
 * is who reads them.
 */
export interface OperationsServiceDeps {
  readonly agents: AgentRepository;
  readonly capabilities: ToolRepository;
  readonly plans: ExecutionPlanRepository;
  readonly invocations: ToolInvocationRepository;
  readonly approvals: ApprovalRequestRepository;
}

export class OperationsService {
  private readonly agents: AgentRepository;
  private readonly capabilities: ToolRepository;
  private readonly plans: ExecutionPlanRepository;
  private readonly invocations: ToolInvocationRepository;
  private readonly approvals: ApprovalRequestRepository;

  constructor(deps: OperationsServiceDeps) {
    this.agents = deps.agents;
    this.capabilities = deps.capabilities;
    this.plans = deps.plans;
    this.invocations = deps.invocations;
    this.approvals = deps.approvals;
  }

  /**
   * The tenant's AI operations in counts and rates: how much is registered, how much has run, how much a human
   * stood in front of, and how much had to be undone.
   */
  async summarize(tenantId: TenantId): Promise<AgentOperationsSummary> {
    const [agents, capabilities, plans, invocations, approvals] = await Promise.all([
      this.agents.listByTenant(tenantId),
      this.capabilities.listByTenant(tenantId),
      this.plans.listByTenant(tenantId),
      this.invocations.listByTenant(tenantId),
      this.approvals.listByTenant(tenantId),
    ]);

    return summarizeAgentOperations({
      agents: agents.map(toAgentView),
      capabilities: capabilities.map(toToolView),
      plans: plans.map(toPlanView),
      invocations: invocations.map(toInvocationSummaryView),
      approvals: approvals.map(toApprovalView),
    });
  }

  /** The plan pipeline rolled up by status — what is drafted, waiting, running and settled. */
  async planPipeline(tenantId: TenantId): Promise<readonly KeyCount[]> {
    const plans = await this.plans.listByTenant(tenantId);
    return plansByStatus(plans.map(toPlanView));
  }

  /** Plans rolled up by agent — which registered agents are actually being planned with. */
  async planLoadByAgent(tenantId: TenantId): Promise<readonly KeyCount[]> {
    const plans = await this.plans.listByTenant(tenantId);
    return plansByAgent(plans.map(toPlanView));
  }

  /**
   * Invocations rolled up by capability — which parts of the catalog the runtime actually reaches for. The
   * counterpart question, which registered capabilities are never reached for at all, is answerable by reading
   * this against {@link ToolRepository.listByTenant}: a capability granted everywhere and invoked never is reach
   * nobody is using, and reach nobody is using is reach worth withdrawing.
   */
  async capabilityUsage(tenantId: TenantId): Promise<readonly KeyCount[]> {
    const invocations = await this.invocations.listByTenant(tenantId);
    return invocationsByCapability(invocations.map(toInvocationView));
  }
}
