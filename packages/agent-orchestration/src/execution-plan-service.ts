import { toUuid } from "@knowget/shared";
import type { EventBus } from "@knowget/events";
import type { DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import type { AgentView, PlanInspection, PlanProgress, PlanStepView, ToolView } from "./ai-view";
import { normalizeCapabilityKey } from "./ai-value";
import { toAgentView } from "./agent";
import {
  approvalRequested,
  planApproved,
  planCancelled,
  planCompleted,
  planDrafted,
  planExecutionStarted,
  planFailed,
  planRejected,
  planRolledBack,
  planSubmitted,
} from "./ai-events";
import {
  type ApprovalDecisionParams,
  type ApprovalRequest,
  approveRequest,
  createApprovalRequest,
  rejectRequest,
} from "./approval-request";
import {
  type AddPlanStepParams,
  type CreateExecutionPlanParams,
  type ExecutionPlan,
  addPlanStep,
  approveExecutionPlan,
  beginStep,
  cancelExecution,
  compensateStep,
  completeExecution,
  createExecutionPlan,
  executionProgress,
  failExecution,
  failStep,
  inspectExecutionPlan,
  rejectExecutionPlan,
  removePlanStep,
  restatePlanGoal,
  rollBackExecution,
  skipStep,
  startExecution,
  submitExecutionPlan,
  succeedStep,
  toPlanStepViews,
} from "./execution-plan";
import { highestRisk, nextExecutableSteps } from "./planning";
import { toToolView } from "./tool";
import {
  AgentNotFoundError,
  ApprovalRequestNotFoundError,
  ExecutionPlanNotFoundError,
  OrganizationNotFoundForAgentError,
  UnknownCapabilityError,
} from "./errors";
import type {
  AgentRepository,
  ApprovalRequestRepository,
  ExecutionPlanRepository,
  OrganizationDirectory,
  ToolRepository,
} from "./ports";

/**
 * Application service for execution plans — and, with them, the human gate that guards their execution.
 *
 * The gate is owned here end to end, and deliberately not split. {@link submit} inspects the plan against the
 * live catalog, submits it, and — when the plan lands `awaiting_approval` — raises and saves the approval
 * request in the same operation. A plan that could reach `awaiting_approval` without a request having been
 * raised would be a plan waiting on a gate nobody was asked to open: it would look governed and would simply
 * stop, forever, with no queue entry and nobody accountable. {@link approve} and {@link reject} likewise decide
 * the request *and* move the plan together, so the two can never disagree about what a person actually said.
 *
 * Step authoring is checked against the catalog, because the catalog is the only invocation surface there is. A
 * step naming a key nothing answers to would pass inspection as "unknown capability" at submission time — but
 * catching it at authoring time is the difference between an error the author sees and an error the approver
 * inherits.
 */
export interface ExecutionPlanServiceDeps {
  readonly repository: ExecutionPlanRepository;
  readonly agents: AgentRepository;
  readonly capabilities: ToolRepository;
  readonly approvals: ApprovalRequestRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/** A plan and the approval request it is waiting on, when it is waiting on one. */
export interface SubmittedPlan {
  readonly plan: ExecutionPlan;
  readonly approvalRequest: ApprovalRequest | null;
}

export class ExecutionPlanService {
  private readonly repository: ExecutionPlanRepository;
  private readonly agents: AgentRepository;
  private readonly capabilities: ToolRepository;
  private readonly approvals: ApprovalRequestRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ExecutionPlanServiceDeps) {
    this.repository = deps.repository;
    this.agents = deps.agents;
    this.capabilities = deps.capabilities;
    this.approvals = deps.approvals;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  /** Draft a plan for an agent that exists. It starts empty and moves nothing until it is submitted. */
  async draft(input: CreateExecutionPlanParams): Promise<ExecutionPlan> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForAgentError(input.organizationId);
    }
    await this.requireAgent(input.tenantId, input.agentId);
    const plan = createExecutionPlan(input);
    await this.repository.save(plan);
    await this.emit(planDrafted(plan));
    return plan;
  }

  async restateGoal(tenantId: TenantId, id: Uuid, goal: string): Promise<ExecutionPlan> {
    return this.save(restatePlanGoal(await this.require(tenantId, id), goal));
  }

  /** Add a step naming a capability the catalog actually holds. */
  async addStep(tenantId: TenantId, id: Uuid, params: AddPlanStepParams): Promise<ExecutionPlan> {
    const plan = await this.require(tenantId, id);
    const capabilityKey = normalizeCapabilityKey(params.capabilityKey);
    if (!(await this.capabilities.findByKey(tenantId, capabilityKey))) {
      throw new UnknownCapabilityError(capabilityKey);
    }
    return this.save(addPlanStep(plan, { ...params, capabilityKey }));
  }

  async removeStep(tenantId: TenantId, id: Uuid, stepId: string): Promise<ExecutionPlan> {
    return this.save(removePlanStep(await this.require(tenantId, id), stepId));
  }

  /** Inspect a plan against the live catalog without moving it — what an author or a reviewer reads. */
  async inspect(tenantId: TenantId, id: Uuid): Promise<PlanInspection> {
    const plan = await this.require(tenantId, id);
    return inspectExecutionPlan(plan, await this.catalogFor(plan));
  }

  /**
   * Submit a plan for execution: inspect it, move it, and raise the human request if one is owed.
   *
   * The request's risk is the highest risk the plan reaches, not the risk of any one step, because what a person
   * is being asked to accept is the plan — and a plan is exactly as dangerous as its most dangerous step.
   */
  async submit(
    tenantId: TenantId,
    id: Uuid,
    expiresAt?: ISODateString | null,
  ): Promise<SubmittedPlan> {
    const plan = await this.require(tenantId, id);
    const catalog = await this.catalogFor(plan);
    const submitted = submitExecutionPlan(plan, catalog);
    await this.repository.save(submitted);
    await this.emit(planSubmitted(submitted));

    if (submitted.status !== "awaiting_approval") {
      return { plan: submitted, approvalRequest: null };
    }

    const request = createApprovalRequest({
      tenantId: submitted.tenantId,
      organizationId: submitted.organizationId,
      subject: "execution_plan",
      subjectId: submitted.id,
      agentId: submitted.agentId,
      reasons: [],
      riskLevel: highestRisk(catalog) ?? "low",
      expiresAt: expiresAt ?? null,
    });
    await this.approvals.save(request);
    await this.emit(approvalRequested(request));
    return { plan: submitted, approvalRequest: request };
  }

  /** A named person lets the plan through. The request is decided and the plan moves, together. */
  async approve(
    tenantId: TenantId,
    id: Uuid,
    params: ApprovalDecisionParams,
  ): Promise<SubmittedPlan> {
    const { plan, request } = await this.requireOpenGate(tenantId, id);
    const decided = approveRequest(request, params);
    await this.approvals.save(decided);
    const approved = approveExecutionPlan(plan, decided.id);
    await this.repository.save(approved);
    await this.emit(planApproved(approved));
    return { plan: approved, approvalRequest: decided };
  }

  /** A named person refuses it. The plan is terminal from here — a refused plan is not re-openable. */
  async reject(
    tenantId: TenantId,
    id: Uuid,
    params: ApprovalDecisionParams,
  ): Promise<SubmittedPlan> {
    const { plan, request } = await this.requireOpenGate(tenantId, id);
    const decided = rejectRequest(request, params);
    await this.approvals.save(decided);
    const rejected = rejectExecutionPlan(plan, decided.id);
    await this.repository.save(rejected);
    await this.emit(planRejected(rejected));
    return { plan: rejected, approvalRequest: decided };
  }

  async start(tenantId: TenantId, id: Uuid): Promise<ExecutionPlan> {
    const next = startExecution(await this.require(tenantId, id));
    await this.repository.save(next);
    await this.emit(planExecutionStarted(next));
    return next;
  }

  /**
   * The steps a runner may pick up right now: still pending, with everything they wait on already succeeded, in
   * the plan's written order wherever the graph leaves a choice.
   */
  async nextSteps(tenantId: TenantId, id: Uuid): Promise<readonly PlanStepView[]> {
    return nextExecutableSteps(toPlanStepViews(await this.require(tenantId, id)));
  }

  /** How far through the plan execution has got — what a progress display and a stalled-plan sweep both read. */
  async progress(tenantId: TenantId, id: Uuid): Promise<PlanProgress> {
    return executionProgress(await this.require(tenantId, id));
  }

  async beginStep(tenantId: TenantId, id: Uuid, stepId: string): Promise<ExecutionPlan> {
    return this.save(beginStep(await this.require(tenantId, id), stepId));
  }

  /**
   * Record that a step succeeded, and which invocation carried it out. The invocation id is required rather than
   * optional: a step that claims to have run but names nothing that ran is a plan whose execution cannot be
   * audited, and the link is what a rollback later walks back along.
   */
  async succeedStep(
    tenantId: TenantId,
    id: Uuid,
    stepId: string,
    invocationId: string,
  ): Promise<ExecutionPlan> {
    return this.save(succeedStep(await this.require(tenantId, id), stepId, invocationId));
  }

  /** Record that a step failed. The plan does not fail with it — whether to roll back is decided above this. */
  async failStep(
    tenantId: TenantId,
    id: Uuid,
    stepId: string,
    invocationId?: string | null,
  ): Promise<ExecutionPlan> {
    return this.save(failStep(await this.require(tenantId, id), stepId, invocationId));
  }

  /** Skip a step that will not run — because something it waited on failed, or the plan is being abandoned. */
  async skipStep(tenantId: TenantId, id: Uuid, stepId: string): Promise<ExecutionPlan> {
    return this.save(skipStep(await this.require(tenantId, id), stepId));
  }

  /** Record that a step which had succeeded has been undone by its compensating invocation. */
  async compensateStep(tenantId: TenantId, id: Uuid, stepId: string): Promise<ExecutionPlan> {
    return this.save(compensateStep(await this.require(tenantId, id), stepId));
  }

  async complete(tenantId: TenantId, id: Uuid): Promise<ExecutionPlan> {
    const next = completeExecution(await this.require(tenantId, id));
    await this.repository.save(next);
    await this.emit(planCompleted(next));
    return next;
  }

  async fail(tenantId: TenantId, id: Uuid): Promise<ExecutionPlan> {
    const next = failExecution(await this.require(tenantId, id));
    await this.repository.save(next);
    await this.emit(planFailed(next));
    return next;
  }

  async rollBack(tenantId: TenantId, id: Uuid): Promise<ExecutionPlan> {
    const next = rollBackExecution(await this.require(tenantId, id));
    await this.repository.save(next);
    await this.emit(planRolledBack(next));
    return next;
  }

  async cancel(tenantId: TenantId, id: Uuid): Promise<ExecutionPlan> {
    const next = cancelExecution(await this.require(tenantId, id));
    await this.repository.save(next);
    await this.emit(planCancelled(next));
    return next;
  }

  async get(tenantId: TenantId, id: Uuid): Promise<ExecutionPlan> {
    return this.require(tenantId, id);
  }

  async listByAgent(tenantId: TenantId, agentId: string): Promise<ExecutionPlan[]> {
    return this.repository.listByAgent(tenantId, agentId);
  }

  /** What this reasoning produced — the link from a session to the plans it led to. */
  async listBySession(tenantId: TenantId, reasoningSessionId: string): Promise<ExecutionPlan[]> {
    return this.repository.listBySession(tenantId, reasoningSessionId);
  }

  async list(tenantId: TenantId): Promise<ExecutionPlan[]> {
    return this.repository.listByTenant(tenantId);
  }

  /** Discard a plan that never ran. Anything that executed is cancelled or rolled back, never deleted. */
  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    await this.require(tenantId, id);
    await this.repository.remove(tenantId, id);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<ExecutionPlan> {
    const plan = await this.repository.findById(tenantId, id);
    if (!plan) {
      throw new ExecutionPlanNotFoundError(id);
    }
    return plan;
  }

  private async requireAgent(tenantId: TenantId, agentId: string): Promise<void> {
    if (!(await this.agents.findById(tenantId, toUuid(agentId)))) {
      throw new AgentNotFoundError(agentId);
    }
  }

  /** The plan and the open request standing in front of it, or a clear "there is no gate here to decide". */
  private async requireOpenGate(
    tenantId: TenantId,
    id: Uuid,
  ): Promise<{ plan: ExecutionPlan; request: ApprovalRequest }> {
    const plan = await this.require(tenantId, id);
    const request = await this.approvals.findOpenForSubject(tenantId, "execution_plan", plan.id);
    if (!request) {
      throw new ApprovalRequestNotFoundError(plan.id);
    }
    return { plan, request };
  }

  /**
   * The catalog entries this plan names, as the engines read them. One read, not one per step — and only the
   * entries the plan actually refers to, so inspection is not a scan of the whole catalog.
   */
  private async catalogFor(plan: ExecutionPlan): Promise<readonly ToolView[]> {
    const keys = [...new Set(plan.steps.map((step) => step.capabilityKey))];
    const tools = await this.capabilities.findManyByKeys(plan.tenantId, keys);
    return tools.map(toToolView);
  }

  /** Agent view for callers that need the authorization engine's picture of the plan's agent. */
  async agentViewFor(plan: ExecutionPlan): Promise<AgentView> {
    const agent = await this.agents.findById(plan.tenantId, toUuid(plan.agentId));
    if (!agent) {
      throw new AgentNotFoundError(plan.agentId);
    }
    return toAgentView(agent);
  }

  private async save(plan: ExecutionPlan): Promise<ExecutionPlan> {
    await this.repository.save(plan);
    return plan;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
