import { toUuid } from "@knowget/shared";
import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import type { SessionGrounding, SessionSummary } from "./ai-view";
import {
  sessionAbandoned,
  sessionConcluded,
  sessionOpened,
  sessionTraceRecorded,
} from "./ai-events";
import {
  type CreateReasoningSessionParams,
  type ReasoningSession,
  type ReasoningTrace,
  type RecordTraceParams,
  abandonSession,
  attachExecutionPlan,
  concludeSession,
  consultedKnowledgeRefs,
  createReasoningSession,
  decide,
  findTrace,
  infer,
  observe,
  reasoningSummary,
  recordTrace,
  retrieveKnowledge,
  sessionGrounding,
} from "./reasoning-session";
import {
  AgentNotFoundError,
  ExecutionPlanNotFoundError,
  OrganizationNotFoundForAgentError,
  PlanAgentMismatchError,
  ReasoningSessionNotFoundError,
} from "./errors";
import type {
  AgentRepository,
  ExecutionPlanRepository,
  OrganizationDirectory,
  ReasoningSessionRepository,
} from "./ports";

/**
 * Application service for reasoning sessions — the inspectable record of how an agent got to what it proposed.
 *
 * Almost nothing is decided here: the aggregate already refuses to record a retrieval that cites no knowledge, an
 * inference resting on nothing, or anything at all once the session has closed. What this layer adds is the two
 * things the aggregate cannot see. It resolves the agent, so a session cannot be opened in the name of an agent
 * that does not exist; and it resolves the plan on {@link attachPlan}, so the link between reasoning and action
 * points at something real, drafted by the same agent.
 *
 * Note what is absent: there is no `remove`. Every other aggregate in this package can discard a draft, because a
 * draft is a proposal nobody acted on. A reasoning session is neither — it is the answer to "why did the agent do
 * that", and an answer that can be deleted once it becomes inconvenient is not one. Sessions are concluded or
 * abandoned; both are recorded, and neither is erasure.
 *
 * Opening a session deliberately does *not* require an active agent. Reasoning invokes nothing and changes
 * nothing outside its own record, so gating it would buy no safety; the gate that matters stands at invocation,
 * where an agent's status is checked against every single call it tries to make.
 */
export interface ReasoningServiceDeps {
  readonly repository: ReasoningSessionRepository;
  readonly agents: AgentRepository;
  readonly plans: ExecutionPlanRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class ReasoningService {
  private readonly repository: ReasoningSessionRepository;
  private readonly agents: AgentRepository;
  private readonly plans: ExecutionPlanRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ReasoningServiceDeps) {
    this.repository = deps.repository;
    this.agents = deps.agents;
    this.plans = deps.plans;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  /** Open a session against a question. It starts empty, having concluded nothing. */
  async open(input: CreateReasoningSessionParams): Promise<ReasoningSession> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForAgentError(input.organizationId);
    }
    if (!(await this.agents.findById(input.tenantId, toUuid(input.agentId)))) {
      throw new AgentNotFoundError(input.agentId);
    }
    const session = createReasoningSession(input);
    await this.repository.save(session);
    await this.emit(sessionOpened(session));
    return session;
  }

  /** Record any step, kind given explicitly — the general form the four named ones below sit on. */
  async record(tenantId: TenantId, id: Uuid, params: RecordTraceParams): Promise<ReasoningSession> {
    return this.append(recordTrace(await this.require(tenantId, id), params));
  }

  /**
   * Bring institutional knowledge into the session. The references are knowledge-graph ids (P2-D25) and the
   * aggregate will not accept a retrieval without them: knowledge enters here or it does not enter.
   */
  async retrieve(
    tenantId: TenantId,
    id: Uuid,
    statement: string,
    knowledgeRefs: readonly string[],
    confidence?: number,
  ): Promise<ReasoningSession> {
    const session = await this.require(tenantId, id);
    return this.append(retrieveKnowledge(session, statement, knowledgeRefs, confidence));
  }

  /** Record something the runtime saw. */
  async observe(
    tenantId: TenantId,
    id: Uuid,
    statement: string,
    confidence?: number,
  ): Promise<ReasoningSession> {
    return this.append(observe(await this.require(tenantId, id), statement, confidence));
  }

  /** Conclude something from earlier steps, citing them. */
  async infer(
    tenantId: TenantId,
    id: Uuid,
    statement: string,
    dependsOn: readonly string[],
    confidence?: number,
  ): Promise<ReasoningSession> {
    const session = await this.require(tenantId, id);
    return this.append(infer(session, statement, dependsOn, confidence));
  }

  /** Settle on a course of action, citing what it rests on. */
  async decide(
    tenantId: TenantId,
    id: Uuid,
    statement: string,
    dependsOn: readonly string[],
    confidence?: number,
  ): Promise<ReasoningSession> {
    const session = await this.require(tenantId, id);
    return this.append(decide(session, statement, dependsOn, confidence));
  }

  /**
   * Link the session to the plan its reasoning produced, once that plan exists and was drafted by this session's
   * own agent. Attaching is what makes the trail answerable from either end: from a plan, why it was proposed;
   * from a session, what it led to.
   */
  async attachPlan(
    tenantId: TenantId,
    id: Uuid,
    executionPlanId: string,
  ): Promise<ReasoningSession> {
    const session = await this.require(tenantId, id);
    const plan = await this.plans.findById(tenantId, toUuid(executionPlanId));
    if (!plan) {
      throw new ExecutionPlanNotFoundError(executionPlanId);
    }
    if (plan.agentId !== session.agentId) {
      throw new PlanAgentMismatchError(plan.id, session.agentId, plan.agentId);
    }
    return this.save(attachExecutionPlan(session, plan.id));
  }

  /**
   * Close the session with what it settled on. The aggregate re-runs the grounding check here and refuses an
   * unsound session, so a concluded session is one whose reasoning actually holds — not one that merely claims to.
   */
  async conclude(tenantId: TenantId, id: Uuid, conclusion: string): Promise<ReasoningSession> {
    const settled = concludeSession(await this.require(tenantId, id), conclusion);
    await this.repository.save(settled);
    await this.emit(sessionConcluded(settled));
    return settled;
  }

  /** Give up on the session. Available whatever state the reasoning is in — that is the point of it. */
  async abandon(tenantId: TenantId, id: Uuid): Promise<ReasoningSession> {
    const settled = abandonSession(await this.require(tenantId, id));
    await this.repository.save(settled);
    await this.emit(sessionAbandoned(settled));
    return settled;
  }

  async get(tenantId: TenantId, id: Uuid): Promise<ReasoningSession> {
    return this.require(tenantId, id);
  }

  /** One recorded step of a session. */
  async trace(tenantId: TenantId, id: Uuid, traceId: string): Promise<ReasoningTrace> {
    return findTrace(await this.require(tenantId, id), traceId);
  }

  /** How well-founded the session is — what an auditor reads before trusting its conclusion. */
  async grounding(tenantId: TenantId, id: Uuid): Promise<SessionGrounding> {
    return sessionGrounding(await this.require(tenantId, id));
  }

  /** The descriptive picture: grounding, decision confidence, how much the session concluded. */
  async summarize(tenantId: TenantId, id: Uuid): Promise<SessionSummary> {
    return reasoningSummary(await this.require(tenantId, id));
  }

  /** Every knowledge-graph reference the session consulted, in the order it first reached for them. */
  async knowledgeRefs(tenantId: TenantId, id: Uuid): Promise<readonly string[]> {
    return consultedKnowledgeRefs(await this.require(tenantId, id));
  }

  async listByAgent(tenantId: TenantId, agentId: string): Promise<ReasoningSession[]> {
    return this.repository.listByAgent(tenantId, agentId);
  }

  async list(tenantId: TenantId): Promise<ReasoningSession[]> {
    return this.repository.listByTenant(tenantId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<ReasoningSession> {
    const session = await this.repository.findById(tenantId, id);
    if (!session) {
      throw new ReasoningSessionNotFoundError(id);
    }
    return session;
  }

  /** Persist an appended session and announce the step it just gained. */
  private async append(session: ReasoningSession): Promise<ReasoningSession> {
    await this.repository.save(session);
    await this.emit(sessionTraceRecorded(session));
    return session;
  }

  private async save(session: ReasoningSession): Promise<ReasoningSession> {
    await this.repository.save(session);
    return session;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
