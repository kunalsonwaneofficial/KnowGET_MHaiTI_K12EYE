import { toUuid } from "@knowget/shared";
import type { EventBus } from "@knowget/events";
import type { DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import type { AgentView, AuthorizationDecision, CompensationPlan, ToolView } from "./ai-view";
import { normalizeCapabilityKey } from "./ai-value";
import { toAgentView } from "./agent";
import {
  approvalRequested,
  invocationAuthorized,
  invocationCompensated,
  invocationDenied,
  invocationFailed,
  invocationStarted,
  invocationSucceeded,
} from "./ai-events";
import { type ApprovalRequest, isApprovalGranted, requestApprovalFor } from "./approval-request";
import { authorizeInvocation } from "./authorization";
import { compensationPlan } from "./rollback";
import { toToolView } from "./tool";
import {
  type ToolInvocation,
  authorizeToolInvocation,
  beginInvocation,
  compensateInvocation,
  failInvocation,
  succeedInvocation,
  toInvocationView,
} from "./tool-invocation";
import {
  AgentNotFoundError,
  ApprovalNotRequiredError,
  ApprovalRequestNotFoundError,
  ExecutionPlanNotFoundError,
  OrganizationNotFoundForAgentError,
  PlanStepNotFoundError,
  ToolInvocationNotFoundError,
  UnknownCapabilityError,
} from "./errors";
import type {
  AgentRepository,
  ApprovalRequestRepository,
  ExecutionPlanRepository,
  OrganizationDirectory,
  ToolInvocationRepository,
  ToolRepository,
} from "./ports";

/**
 * Application service for permission-controlled capability invocation — the runtime's narrowest and most
 * consequential door.
 *
 * Everything an agent does to an institution passes through here, and it passes through the *catalog*: an
 * invocation names a capability key, that key is resolved against the registered catalog, and the capability is
 * what touches institutional state. Agents invoke capabilities; they never reach a database, and there is no
 * path through this service by which they could.
 *
 * A refusal is announced. {@link authorize} emits `ai.invocation.denied` when authorization does not open, which
 * is the one event in this domain with no aggregate behind it — the record deliberately does not exist, because
 * an invocation that was refused did not happen. Without the event, the runtime's most security-relevant moments
 * would be its quietest: every success observable, every attempted overreach silent.
 */
export interface InvocationServiceDeps {
  readonly repository: ToolInvocationRepository;
  readonly agents: AgentRepository;
  readonly capabilities: ToolRepository;
  readonly approvals: ApprovalRequestRepository;
  readonly plans: ExecutionPlanRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/** What the runtime supplies to authorize one call. The approval, if any, is resolved here rather than passed. */
export interface AuthorizeInvocationInput {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly agentId: string;
  readonly capabilityKey: string;
  readonly planId?: string | null;
  readonly stepId?: string | null;
  readonly ordinal?: number;
  /** A specific decided approval to spend. Omitted, the service looks for one raised for this same subject. */
  readonly approvalRequestId?: string | null;
}

/** What is needed to raise the human gate for one call, before any invocation record exists. */
export interface RequestInvocationApprovalInput {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly agentId: string;
  readonly capabilityKey: string;
  readonly stepId?: string | null;
  readonly expiresAt?: ISODateString | null;
}

/**
 * The subject an invocation-level approval is raised against.
 *
 * An invocation cannot be the subject of its own approval: the record only exists once authorization has already
 * opened, so a request naming it could only ever be raised after the moment it was meant to gate. The subject is
 * therefore the plan step the call belongs to, or — for a call outside any plan — the agent-and-capability pair,
 * which is exactly the scope `coversInvocation` enforces when the approval is spent.
 */
export const invocationSubjectId = (
  agentId: string,
  capabilityKey: string,
  stepId?: string | null,
): string => stepId ?? `${agentId}:${capabilityKey}`;

export class InvocationService {
  private readonly repository: ToolInvocationRepository;
  private readonly agents: AgentRepository;
  private readonly capabilities: ToolRepository;
  private readonly approvals: ApprovalRequestRepository;
  private readonly plans: ExecutionPlanRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: InvocationServiceDeps) {
    this.repository = deps.repository;
    this.agents = deps.agents;
    this.capabilities = deps.capabilities;
    this.approvals = deps.approvals;
    this.plans = deps.plans;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  /** What authorization would decide right now, without recording anything. What an operator inspects. */
  async decide(
    tenantId: TenantId,
    agentId: string,
    capabilityKey: string,
  ): Promise<AuthorizationDecision> {
    const { agent, tool } = await this.resolve(tenantId, agentId, capabilityKey);
    return authorizeInvocation(agent, tool);
  }

  /**
   * Raise the human gate for one call.
   *
   * Refused unless authorization actually resolved to `requires_approval`. An `allowed` call has nothing to ask
   * about, and a `denied` one is a *grant* failure that no approval can rescue — putting either in front of a
   * person would give them a real prompt over an outcome their answer cannot change. An existing open request
   * for the same subject is returned as-is rather than duplicated: one question, asked once.
   */
  async requestApproval(input: RequestInvocationApprovalInput): Promise<ApprovalRequest> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForAgentError(input.organizationId);
    }
    const { agent, tool } = await this.resolve(input.tenantId, input.agentId, input.capabilityKey);
    const decision = authorizeInvocation(agent, tool);
    if (decision.outcome !== "requires_approval") {
      throw new ApprovalNotRequiredError(
        decision.agentId,
        decision.capabilityKey,
        decision.outcome,
      );
    }

    const subjectId = invocationSubjectId(
      decision.agentId,
      decision.capabilityKey,
      input.stepId ?? null,
    );
    const open = await this.approvals.findOpenForSubject(
      input.tenantId,
      "tool_invocation",
      subjectId,
    );
    if (open) {
      return open;
    }

    const request = requestApprovalFor(decision, {
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      subject: "tool_invocation",
      subjectId,
      expiresAt: input.expiresAt ?? null,
    });
    await this.approvals.save(request);
    await this.emit(approvalRequested(request));
    return request;
  }

  /**
   * Authorize one call and record it — or refuse, loudly.
   *
   * The decision is computed before anything is written, the approval in hand is checked to be this agent's and
   * this capability's, and only a decision that opens produces a record. Anything else emits the denial and
   * throws.
   */
  async authorize(input: AuthorizeInvocationInput): Promise<ToolInvocation> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForAgentError(input.organizationId);
    }
    const { agent, tool } = await this.resolve(input.tenantId, input.agentId, input.capabilityKey);
    await this.requirePlacement(input.tenantId, input.planId ?? null, input.stepId ?? null);

    const decision = authorizeInvocation(agent, tool);
    const approval = await this.resolveApproval(input, decision);

    let invocation: ToolInvocation;
    try {
      invocation = authorizeToolInvocation({
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        agent,
        tool,
        planId: input.planId ?? null,
        stepId: input.stepId ?? null,
        ordinal: input.ordinal ?? 1,
        approval,
      });
    } catch (error) {
      await this.emit(
        invocationDenied({
          tenantId: input.tenantId,
          organizationId: input.organizationId,
          agentId: decision.agentId,
          planId: input.planId ?? null,
          stepId: input.stepId ?? null,
          capabilityKey: decision.capabilityKey,
          riskLevel: decision.riskLevel,
          reasons: decision.reasons,
        }),
      );
      throw error;
    }

    await this.repository.save(invocation);
    await this.emit(invocationAuthorized(invocation));
    return invocation;
  }

  async begin(tenantId: TenantId, id: Uuid): Promise<ToolInvocation> {
    const next = beginInvocation(await this.require(tenantId, id));
    await this.repository.save(next);
    await this.emit(invocationStarted(next));
    return next;
  }

  async succeed(tenantId: TenantId, id: Uuid): Promise<ToolInvocation> {
    const next = succeedInvocation(await this.require(tenantId, id));
    await this.repository.save(next);
    await this.emit(invocationSucceeded(next));
    return next;
  }

  async fail(tenantId: TenantId, id: Uuid, failureCode?: string | null): Promise<ToolInvocation> {
    const next = failInvocation(await this.require(tenantId, id), failureCode);
    await this.repository.save(next);
    await this.emit(invocationFailed(next));
    return next;
  }

  /** Record that a compensating call has undone this one, and link the two. */
  async compensate(
    tenantId: TenantId,
    id: Uuid,
    compensatingInvocationId: string,
  ): Promise<ToolInvocation> {
    const compensator = await this.require(tenantId, toUuid(compensatingInvocationId));
    const next = compensateInvocation(await this.require(tenantId, id), compensator.id);
    await this.repository.save(next);
    await this.emit(invocationCompensated(next));
    return next;
  }

  /**
   * What undoing this plan would take, derived from what its invocations actually did — in reverse order, and
   * honest about the parts that cannot be undone at all.
   */
  async rollbackPlanFor(tenantId: TenantId, planId: string): Promise<CompensationPlan> {
    const invocations = await this.repository.listByPlan(tenantId, planId);
    return compensationPlan(invocations.map(toInvocationView));
  }

  async get(tenantId: TenantId, id: Uuid): Promise<ToolInvocation> {
    return this.require(tenantId, id);
  }

  async listByPlan(tenantId: TenantId, planId: string): Promise<ToolInvocation[]> {
    return this.repository.listByPlan(tenantId, planId);
  }

  async listByAgent(tenantId: TenantId, agentId: string): Promise<ToolInvocation[]> {
    return this.repository.listByAgent(tenantId, agentId);
  }

  async list(tenantId: TenantId): Promise<ToolInvocation[]> {
    return this.repository.listByTenant(tenantId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<ToolInvocation> {
    const invocation = await this.repository.findById(tenantId, id);
    if (!invocation) {
      throw new ToolInvocationNotFoundError(id);
    }
    return invocation;
  }

  /** The agent and the catalog entry, as the authorization engine reads them. */
  private async resolve(
    tenantId: TenantId,
    agentId: string,
    capabilityKey: string,
  ): Promise<{ agent: AgentView; tool: ToolView }> {
    const agent = await this.agents.findById(tenantId, toUuid(agentId));
    if (!agent) {
      throw new AgentNotFoundError(agentId);
    }
    const key = normalizeCapabilityKey(capabilityKey);
    const tool = await this.capabilities.findByKey(tenantId, key);
    if (!tool) {
      throw new UnknownCapabilityError(key);
    }
    return { agent: toAgentView(agent), tool: toToolView(tool) };
  }

  /**
   * An invocation that claims to belong to a plan step must belong to one. A dangling step id would sever the
   * call from the plan it is meant to be accountable to, and a rollback derived from that plan would miss it.
   */
  private async requirePlacement(
    tenantId: TenantId,
    planId: string | null,
    stepId: string | null,
  ): Promise<void> {
    if (planId === null) {
      return;
    }
    const plan = await this.plans.findById(tenantId, toUuid(planId));
    if (!plan) {
      throw new ExecutionPlanNotFoundError(planId);
    }
    if (stepId !== null && !plan.steps.some((step) => step.id === stepId)) {
      throw new PlanStepNotFoundError(stepId);
    }
  }

  /**
   * The approval to spend on this call: the one named, or the granted one already raised for this subject. A
   * request that is still pending is not an approval — it is a question — so it is deliberately not picked up.
   */
  private async resolveApproval(
    input: AuthorizeInvocationInput,
    decision: AuthorizationDecision,
  ): Promise<ApprovalRequest | null> {
    if (input.approvalRequestId) {
      const named = await this.approvals.findById(input.tenantId, toUuid(input.approvalRequestId));
      if (!named) {
        throw new ApprovalRequestNotFoundError(input.approvalRequestId);
      }
      return named;
    }
    if (decision.outcome !== "requires_approval") {
      return null;
    }
    const subjectId = invocationSubjectId(
      decision.agentId,
      decision.capabilityKey,
      input.stepId ?? null,
    );
    const raised = await this.approvals.listBySubject(input.tenantId, "tool_invocation", subjectId);
    return raised.find(isApprovalGranted) ?? null;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
