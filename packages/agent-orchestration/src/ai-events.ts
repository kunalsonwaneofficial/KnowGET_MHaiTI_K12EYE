import { createEvent } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import type { AuthorizationReason, RiskLevel } from "./ai-value";
import type { AgentDefinition } from "./agent";
import type { ToolDefinition } from "./tool";
import type { ExecutionPlan } from "./execution-plan";
import type { ApprovalRequest } from "./approval-request";
import type { ToolInvocation } from "./tool-invocation";
import type { ReasoningSession } from "./reasoning-session";

/**
 * Domain events for the Enterprise AI Operating System (P2-D26), on the `ai.*` namespace.
 *
 * Payloads carry ids, registry keys, statuses, stable reason codes and counts — and nothing else. Every piece of
 * free text this domain holds stays in the domain: a plan's `goal`, a step's `intent`, a session's `purpose` and
 * `conclusion`, a trace's `statement`, an approval's `decisionNote`. So does every person: `decidedByUserId` is
 * on the record, not on the wire. Accountability belongs in the audit trail, where it is read deliberately and
 * within-tenant; an event is broadcast, and broadcasting who approved what is how an operational feed becomes a
 * surveillance feed. A subscriber that genuinely needs the deciding user resolves it from the approval id.
 *
 * The one event here that is not the echo of a saved aggregate is {@link invocationDenied}. An invocation that
 * fails authorization produces no record — the aggregate refuses to exist — so without this event the runtime's
 * most security-relevant moments would be its quietest ones. A refusal is emitted with the reason codes that
 * produced it, so "what did this agent try to do that it was not allowed to do" is answerable from the event
 * stream rather than only from a log line someone thought to write.
 */

// --- Agent registry --------------------------------------------------------------
export const AGENT_REGISTERED = "ai.agent.registered";
export const AGENT_DESCRIBED = "ai.agent.described";
export const AGENT_AUTONOMY_SET = "ai.agent.autonomy_set";
export const AGENT_ACTIVATED = "ai.agent.activated";
export const AGENT_SUSPENDED = "ai.agent.suspended";
export const AGENT_RETIRED = "ai.agent.retired";
export const AGENT_CAPABILITY_GRANTED = "ai.agent.capability_granted";
export const AGENT_CAPABILITY_REVOKED = "ai.agent.capability_revoked";

export interface AgentEventPayload {
  readonly agentId: Uuid;
  readonly organizationId: Uuid;
  readonly key: string;
  readonly autonomyLevel: string;
  readonly status: string;
  readonly grantedCapabilityCount: number;
}

/** A grant change also names the capability, because *which* permission moved is the point of the event. */
export interface AgentCapabilityEventPayload extends AgentEventPayload {
  readonly capabilityKey: string;
}

export type AgentRegisteredEvent = DomainEvent<typeof AGENT_REGISTERED, AgentEventPayload>;
export type AgentDescribedEvent = DomainEvent<typeof AGENT_DESCRIBED, AgentEventPayload>;
export type AgentAutonomySetEvent = DomainEvent<typeof AGENT_AUTONOMY_SET, AgentEventPayload>;
export type AgentActivatedEvent = DomainEvent<typeof AGENT_ACTIVATED, AgentEventPayload>;
export type AgentSuspendedEvent = DomainEvent<typeof AGENT_SUSPENDED, AgentEventPayload>;
export type AgentRetiredEvent = DomainEvent<typeof AGENT_RETIRED, AgentEventPayload>;
export type AgentCapabilityGrantedEvent = DomainEvent<
  typeof AGENT_CAPABILITY_GRANTED,
  AgentCapabilityEventPayload
>;
export type AgentCapabilityRevokedEvent = DomainEvent<
  typeof AGENT_CAPABILITY_REVOKED,
  AgentCapabilityEventPayload
>;

// NB: `name` and `purpose` are the agent's prose and never leave the domain in an event.
const agentPayload = (agent: AgentDefinition): AgentEventPayload => ({
  agentId: agent.id,
  organizationId: agent.organizationId,
  key: agent.key,
  autonomyLevel: agent.autonomyLevel,
  status: agent.status,
  grantedCapabilityCount: agent.grantedCapabilityKeys.length,
});

export const agentRegistered = (a: AgentDefinition): AgentRegisteredEvent =>
  createEvent(AGENT_REGISTERED, agentPayload(a), { tenantId: a.tenantId });
export const agentDescribed = (a: AgentDefinition): AgentDescribedEvent =>
  createEvent(AGENT_DESCRIBED, agentPayload(a), { tenantId: a.tenantId });
export const agentAutonomySet = (a: AgentDefinition): AgentAutonomySetEvent =>
  createEvent(AGENT_AUTONOMY_SET, agentPayload(a), { tenantId: a.tenantId });
export const agentActivated = (a: AgentDefinition): AgentActivatedEvent =>
  createEvent(AGENT_ACTIVATED, agentPayload(a), { tenantId: a.tenantId });
export const agentSuspended = (a: AgentDefinition): AgentSuspendedEvent =>
  createEvent(AGENT_SUSPENDED, agentPayload(a), { tenantId: a.tenantId });
export const agentRetired = (a: AgentDefinition): AgentRetiredEvent =>
  createEvent(AGENT_RETIRED, agentPayload(a), { tenantId: a.tenantId });
export const agentCapabilityGranted = (
  a: AgentDefinition,
  capabilityKey: string,
): AgentCapabilityGrantedEvent =>
  createEvent(
    AGENT_CAPABILITY_GRANTED,
    { ...agentPayload(a), capabilityKey },
    { tenantId: a.tenantId },
  );
export const agentCapabilityRevoked = (
  a: AgentDefinition,
  capabilityKey: string,
): AgentCapabilityRevokedEvent =>
  createEvent(
    AGENT_CAPABILITY_REVOKED,
    { ...agentPayload(a), capabilityKey },
    { tenantId: a.tenantId },
  );

// --- Capability catalog ----------------------------------------------------------
export const CAPABILITY_REGISTERED = "ai.capability.registered";
export const CAPABILITY_DESCRIBED = "ai.capability.described";
export const CAPABILITY_RECLASSIFIED = "ai.capability.reclassified";
export const CAPABILITY_ACTIVATED = "ai.capability.activated";
export const CAPABILITY_DEPRECATED = "ai.capability.deprecated";

export interface CapabilityEventPayload {
  readonly capabilityId: Uuid;
  readonly organizationId: Uuid;
  readonly key: string;
  readonly capabilityDomain: string;
  readonly effect: string;
  readonly riskLevel: string;
  readonly reversibility: string;
  readonly requiresApproval: boolean;
  readonly status: string;
}

export type CapabilityRegisteredEvent = DomainEvent<
  typeof CAPABILITY_REGISTERED,
  CapabilityEventPayload
>;
export type CapabilityDescribedEvent = DomainEvent<
  typeof CAPABILITY_DESCRIBED,
  CapabilityEventPayload
>;
export type CapabilityReclassifiedEvent = DomainEvent<
  typeof CAPABILITY_RECLASSIFIED,
  CapabilityEventPayload
>;
export type CapabilityActivatedEvent = DomainEvent<
  typeof CAPABILITY_ACTIVATED,
  CapabilityEventPayload
>;
export type CapabilityDeprecatedEvent = DomainEvent<
  typeof CAPABILITY_DEPRECATED,
  CapabilityEventPayload
>;

// A reclassification is the event a security reviewer most wants to see, so the risk classification travels
// with every capability event rather than being resolvable only by re-reading the catalog.
const capabilityPayload = (tool: ToolDefinition): CapabilityEventPayload => ({
  capabilityId: tool.id,
  organizationId: tool.organizationId,
  key: tool.key,
  capabilityDomain: tool.capabilityDomain,
  effect: tool.effect,
  riskLevel: tool.riskLevel,
  reversibility: tool.reversibility,
  requiresApproval: tool.requiresApproval,
  status: tool.status,
});

export const capabilityRegistered = (t: ToolDefinition): CapabilityRegisteredEvent =>
  createEvent(CAPABILITY_REGISTERED, capabilityPayload(t), { tenantId: t.tenantId });
export const capabilityDescribed = (t: ToolDefinition): CapabilityDescribedEvent =>
  createEvent(CAPABILITY_DESCRIBED, capabilityPayload(t), { tenantId: t.tenantId });
export const capabilityReclassified = (t: ToolDefinition): CapabilityReclassifiedEvent =>
  createEvent(CAPABILITY_RECLASSIFIED, capabilityPayload(t), { tenantId: t.tenantId });
export const capabilityActivated = (t: ToolDefinition): CapabilityActivatedEvent =>
  createEvent(CAPABILITY_ACTIVATED, capabilityPayload(t), { tenantId: t.tenantId });
export const capabilityDeprecated = (t: ToolDefinition): CapabilityDeprecatedEvent =>
  createEvent(CAPABILITY_DEPRECATED, capabilityPayload(t), { tenantId: t.tenantId });

// --- Execution plans -------------------------------------------------------------
export const PLAN_DRAFTED = "ai.execution_plan.drafted";
export const PLAN_SUBMITTED = "ai.execution_plan.submitted";
export const PLAN_APPROVED = "ai.execution_plan.approved";
export const PLAN_REJECTED = "ai.execution_plan.rejected";
export const PLAN_EXECUTION_STARTED = "ai.execution_plan.execution_started";
export const PLAN_COMPLETED = "ai.execution_plan.completed";
export const PLAN_FAILED = "ai.execution_plan.failed";
export const PLAN_ROLLED_BACK = "ai.execution_plan.rolled_back";
export const PLAN_CANCELLED = "ai.execution_plan.cancelled";

export interface ExecutionPlanEventPayload {
  readonly planId: Uuid;
  readonly organizationId: Uuid;
  readonly agentId: string;
  readonly reasoningSessionId: string | null;
  readonly status: string;
  readonly stepCount: number;
  readonly settledStepCount: number;
  readonly requiresApproval: boolean;
  readonly approvalRequestId: string | null;
}

export type PlanDraftedEvent = DomainEvent<typeof PLAN_DRAFTED, ExecutionPlanEventPayload>;
export type PlanSubmittedEvent = DomainEvent<typeof PLAN_SUBMITTED, ExecutionPlanEventPayload>;
export type PlanApprovedEvent = DomainEvent<typeof PLAN_APPROVED, ExecutionPlanEventPayload>;
export type PlanRejectedEvent = DomainEvent<typeof PLAN_REJECTED, ExecutionPlanEventPayload>;
export type PlanExecutionStartedEvent = DomainEvent<
  typeof PLAN_EXECUTION_STARTED,
  ExecutionPlanEventPayload
>;
export type PlanCompletedEvent = DomainEvent<typeof PLAN_COMPLETED, ExecutionPlanEventPayload>;
export type PlanFailedEvent = DomainEvent<typeof PLAN_FAILED, ExecutionPlanEventPayload>;
export type PlanRolledBackEvent = DomainEvent<typeof PLAN_ROLLED_BACK, ExecutionPlanEventPayload>;
export type PlanCancelledEvent = DomainEvent<typeof PLAN_CANCELLED, ExecutionPlanEventPayload>;

// NB: the plan's `goal` and each step's `intent` are what the agent means to do, in prose, and never leave the
// domain in an event. A subscriber sees the shape of the plan — how many steps, how far it got — not its words.
const planPayload = (plan: ExecutionPlan): ExecutionPlanEventPayload => ({
  planId: plan.id,
  organizationId: plan.organizationId,
  agentId: plan.agentId,
  reasoningSessionId: plan.reasoningSessionId,
  status: plan.status,
  stepCount: plan.steps.length,
  settledStepCount: plan.steps.filter(
    (step) => step.status !== "pending" && step.status !== "executing",
  ).length,
  requiresApproval: plan.requiresApproval,
  approvalRequestId: plan.approvalRequestId,
});

export const planDrafted = (p: ExecutionPlan): PlanDraftedEvent =>
  createEvent(PLAN_DRAFTED, planPayload(p), { tenantId: p.tenantId });
export const planSubmitted = (p: ExecutionPlan): PlanSubmittedEvent =>
  createEvent(PLAN_SUBMITTED, planPayload(p), { tenantId: p.tenantId });
export const planApproved = (p: ExecutionPlan): PlanApprovedEvent =>
  createEvent(PLAN_APPROVED, planPayload(p), { tenantId: p.tenantId });
export const planRejected = (p: ExecutionPlan): PlanRejectedEvent =>
  createEvent(PLAN_REJECTED, planPayload(p), { tenantId: p.tenantId });
export const planExecutionStarted = (p: ExecutionPlan): PlanExecutionStartedEvent =>
  createEvent(PLAN_EXECUTION_STARTED, planPayload(p), { tenantId: p.tenantId });
export const planCompleted = (p: ExecutionPlan): PlanCompletedEvent =>
  createEvent(PLAN_COMPLETED, planPayload(p), { tenantId: p.tenantId });
export const planFailed = (p: ExecutionPlan): PlanFailedEvent =>
  createEvent(PLAN_FAILED, planPayload(p), { tenantId: p.tenantId });
export const planRolledBack = (p: ExecutionPlan): PlanRolledBackEvent =>
  createEvent(PLAN_ROLLED_BACK, planPayload(p), { tenantId: p.tenantId });
export const planCancelled = (p: ExecutionPlan): PlanCancelledEvent =>
  createEvent(PLAN_CANCELLED, planPayload(p), { tenantId: p.tenantId });

// --- Human approval --------------------------------------------------------------
export const APPROVAL_REQUESTED = "ai.approval.requested";
export const APPROVAL_GRANTED = "ai.approval.granted";
export const APPROVAL_REJECTED = "ai.approval.rejected";
export const APPROVAL_EXPIRED = "ai.approval.expired";

export interface ApprovalEventPayload {
  readonly approvalRequestId: Uuid;
  readonly organizationId: Uuid;
  readonly subject: string;
  readonly subjectId: string;
  readonly agentId: string;
  readonly capabilityKey: string | null;
  readonly reasons: readonly AuthorizationReason[];
  readonly riskLevel: string;
  readonly decision: string;
}

export type ApprovalRequestedEvent = DomainEvent<typeof APPROVAL_REQUESTED, ApprovalEventPayload>;
export type ApprovalGrantedEvent = DomainEvent<typeof APPROVAL_GRANTED, ApprovalEventPayload>;
export type ApprovalRejectedEvent = DomainEvent<typeof APPROVAL_REJECTED, ApprovalEventPayload>;
export type ApprovalExpiredEvent = DomainEvent<typeof APPROVAL_EXPIRED, ApprovalEventPayload>;

// NB: `decidedByUserId` and `decisionNote` are deliberately absent. Who approved and what they wrote about it
// are on the record, which is read within-tenant and on purpose; an event is a broadcast, and a broadcast that
// names people turns an operational feed into a surveillance feed. The reason *codes* travel, because a
// subscriber routing a request to the right reviewer needs to know why the gate came up, not who opened it.
const approvalPayload = (request: ApprovalRequest): ApprovalEventPayload => ({
  approvalRequestId: request.id,
  organizationId: request.organizationId,
  subject: request.subject,
  subjectId: request.subjectId,
  agentId: request.agentId,
  capabilityKey: request.capabilityKey,
  reasons: request.reasons,
  riskLevel: request.riskLevel,
  decision: request.decision,
});

export const approvalRequested = (r: ApprovalRequest): ApprovalRequestedEvent =>
  createEvent(APPROVAL_REQUESTED, approvalPayload(r), { tenantId: r.tenantId });
export const approvalGranted = (r: ApprovalRequest): ApprovalGrantedEvent =>
  createEvent(APPROVAL_GRANTED, approvalPayload(r), { tenantId: r.tenantId });
export const approvalRejected = (r: ApprovalRequest): ApprovalRejectedEvent =>
  createEvent(APPROVAL_REJECTED, approvalPayload(r), { tenantId: r.tenantId });
export const approvalExpired = (r: ApprovalRequest): ApprovalExpiredEvent =>
  createEvent(APPROVAL_EXPIRED, approvalPayload(r), { tenantId: r.tenantId });

// --- Tool invocation -------------------------------------------------------------
export const INVOCATION_AUTHORIZED = "ai.invocation.authorized";
export const INVOCATION_DENIED = "ai.invocation.denied";
export const INVOCATION_STARTED = "ai.invocation.started";
export const INVOCATION_SUCCEEDED = "ai.invocation.succeeded";
export const INVOCATION_FAILED = "ai.invocation.failed";
export const INVOCATION_COMPENSATED = "ai.invocation.compensated";

export interface InvocationEventPayload {
  readonly invocationId: Uuid;
  readonly organizationId: Uuid;
  readonly agentId: string;
  readonly planId: string | null;
  readonly stepId: string | null;
  readonly capabilityKey: string;
  readonly riskLevel: string;
  readonly reversibility: string;
  readonly status: string;
  readonly authorizationOutcome: string;
  readonly authorizationReasons: readonly AuthorizationReason[];
  readonly approvalRequestId: string | null;
  readonly compensatedByInvocationId: string | null;
  readonly failureCode: string | null;
}

/**
 * A refusal has no invocation record to describe — the aggregate refuses to be created — so this payload names
 * the attempt rather than the result: which agent reached for which capability, and the codes that stopped it.
 */
export interface InvocationDeniedEventPayload {
  readonly organizationId: Uuid;
  readonly agentId: string;
  readonly planId: string | null;
  readonly stepId: string | null;
  readonly capabilityKey: string;
  readonly riskLevel: string;
  readonly authorizationOutcome: string;
  readonly authorizationReasons: readonly AuthorizationReason[];
}

export type InvocationAuthorizedEvent = DomainEvent<
  typeof INVOCATION_AUTHORIZED,
  InvocationEventPayload
>;
export type InvocationStartedEvent = DomainEvent<typeof INVOCATION_STARTED, InvocationEventPayload>;
export type InvocationSucceededEvent = DomainEvent<
  typeof INVOCATION_SUCCEEDED,
  InvocationEventPayload
>;
export type InvocationFailedEvent = DomainEvent<typeof INVOCATION_FAILED, InvocationEventPayload>;
export type InvocationCompensatedEvent = DomainEvent<
  typeof INVOCATION_COMPENSATED,
  InvocationEventPayload
>;
export type InvocationDeniedEvent = DomainEvent<
  typeof INVOCATION_DENIED,
  InvocationDeniedEventPayload
>;

const invocationPayload = (invocation: ToolInvocation): InvocationEventPayload => ({
  invocationId: invocation.id,
  organizationId: invocation.organizationId,
  agentId: invocation.agentId,
  planId: invocation.planId,
  stepId: invocation.stepId,
  capabilityKey: invocation.capabilityKey,
  riskLevel: invocation.riskLevel,
  reversibility: invocation.reversibility,
  status: invocation.status,
  authorizationOutcome: invocation.authorizationOutcome,
  authorizationReasons: invocation.authorizationReasons,
  approvalRequestId: invocation.approvalRequestId,
  compensatedByInvocationId: invocation.compensatedByInvocationId,
  failureCode: invocation.failureCode,
});

export const invocationAuthorized = (i: ToolInvocation): InvocationAuthorizedEvent =>
  createEvent(INVOCATION_AUTHORIZED, invocationPayload(i), { tenantId: i.tenantId });
export const invocationStarted = (i: ToolInvocation): InvocationStartedEvent =>
  createEvent(INVOCATION_STARTED, invocationPayload(i), { tenantId: i.tenantId });
export const invocationSucceeded = (i: ToolInvocation): InvocationSucceededEvent =>
  createEvent(INVOCATION_SUCCEEDED, invocationPayload(i), { tenantId: i.tenantId });
export const invocationFailed = (i: ToolInvocation): InvocationFailedEvent =>
  createEvent(INVOCATION_FAILED, invocationPayload(i), { tenantId: i.tenantId });
export const invocationCompensated = (i: ToolInvocation): InvocationCompensatedEvent =>
  createEvent(INVOCATION_COMPENSATED, invocationPayload(i), { tenantId: i.tenantId });

/** What the runtime knows about an attempt that authorization refused. */
export interface InvocationDenial {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly agentId: string;
  readonly planId?: string | null;
  readonly stepId?: string | null;
  readonly capabilityKey: string;
  readonly riskLevel: RiskLevel;
  readonly reasons: readonly AuthorizationReason[];
}

/**
 * Announce that an agent was refused. Emitted where no aggregate is produced, so that a denial is as visible as
 * a success — an AI runtime whose refusals are silent is one nobody can audit for the thing that matters most.
 */
export const invocationDenied = (denial: InvocationDenial): InvocationDeniedEvent =>
  createEvent(
    INVOCATION_DENIED,
    {
      organizationId: denial.organizationId,
      agentId: denial.agentId,
      planId: denial.planId ?? null,
      stepId: denial.stepId ?? null,
      capabilityKey: denial.capabilityKey,
      riskLevel: denial.riskLevel,
      authorizationOutcome: "denied",
      authorizationReasons: denial.reasons,
    },
    { tenantId: denial.tenantId },
  );

// --- Reasoning sessions ----------------------------------------------------------
export const SESSION_OPENED = "ai.reasoning_session.opened";
export const SESSION_TRACE_RECORDED = "ai.reasoning_session.trace_recorded";
export const SESSION_CONCLUDED = "ai.reasoning_session.concluded";
export const SESSION_ABANDONED = "ai.reasoning_session.abandoned";

export interface ReasoningSessionEventPayload {
  readonly sessionId: Uuid;
  readonly organizationId: Uuid;
  readonly agentId: string;
  readonly status: string;
  readonly traceCount: number;
  readonly knowledgeRefCount: number;
  readonly executionPlanId: string | null;
}

/** A recorded step names its kind and its position — never what it said. */
export interface ReasoningTraceEventPayload extends ReasoningSessionEventPayload {
  readonly traceId: string;
  readonly traceKind: string;
  readonly ordinal: number;
  readonly confidence: number;
}

export type SessionOpenedEvent = DomainEvent<typeof SESSION_OPENED, ReasoningSessionEventPayload>;
export type SessionTraceRecordedEvent = DomainEvent<
  typeof SESSION_TRACE_RECORDED,
  ReasoningTraceEventPayload
>;
export type SessionConcludedEvent = DomainEvent<
  typeof SESSION_CONCLUDED,
  ReasoningSessionEventPayload
>;
export type SessionAbandonedEvent = DomainEvent<
  typeof SESSION_ABANDONED,
  ReasoningSessionEventPayload
>;

// NB: the session's `purpose` and `conclusion`, and every trace's `statement`, are the reasoning itself and stay
// in the domain. What travels is that reasoning happened, how much of it there was, and how much knowledge it
// rested on — enough to notice an agent concluding from nothing, without republishing what it concluded.
const sessionPayload = (session: ReasoningSession): ReasoningSessionEventPayload => {
  const refs = new Set<string>();
  for (const trace of session.traces) {
    for (const ref of trace.knowledgeRefs) {
      refs.add(ref);
    }
  }
  return {
    sessionId: session.id,
    organizationId: session.organizationId,
    agentId: session.agentId,
    status: session.status,
    traceCount: session.traces.length,
    knowledgeRefCount: refs.size,
    executionPlanId: session.executionPlanId,
  };
};

export const sessionOpened = (s: ReasoningSession): SessionOpenedEvent =>
  createEvent(SESSION_OPENED, sessionPayload(s), { tenantId: s.tenantId });
export const sessionConcluded = (s: ReasoningSession): SessionConcludedEvent =>
  createEvent(SESSION_CONCLUDED, sessionPayload(s), { tenantId: s.tenantId });
export const sessionAbandoned = (s: ReasoningSession): SessionAbandonedEvent =>
  createEvent(SESSION_ABANDONED, sessionPayload(s), { tenantId: s.tenantId });

/**
 * Announce the step just appended to a session. Takes the session *after* the append and reads its last trace,
 * so the event can never describe a step the session does not actually hold.
 */
export const sessionTraceRecorded = (s: ReasoningSession): SessionTraceRecordedEvent => {
  const trace = s.traces[s.traces.length - 1];
  return createEvent(
    SESSION_TRACE_RECORDED,
    {
      ...sessionPayload(s),
      traceId: trace?.id ?? "",
      traceKind: trace?.kind ?? "",
      ordinal: trace?.ordinal ?? 0,
      confidence: trace?.confidence ?? 0,
    },
    { tenantId: s.tenantId },
  );
};
