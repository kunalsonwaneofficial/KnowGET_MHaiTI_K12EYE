import type {
  AuthorizationOutcome,
  AuthorizationReason,
  AutonomyLevel,
  Reversibility,
  RiskLevel,
  ToolEffect,
  TraceKind,
} from "./ai-value";

/**
 * Narrow read views the pure engines operate over. Each is the minimal shape an engine needs — never the full
 * aggregate — so the engines (authorization, plan inspection, rollback, reasoning, metrics) are built and
 * tested before any aggregate or store depends on them, exactly as the platform's pure-engine-first discipline
 * requires.
 */

// --- Authorization ---------------------------------------------------------------

/** An agent as the authorization engine sees it: its state, how far it may go alone, and what it was granted. */
export interface AgentView {
  readonly id: string;
  readonly status: string;
  readonly autonomyLevel: AutonomyLevel;
  /** The capability keys this agent may invoke. The *only* invocation surface it has. */
  readonly grantedCapabilityKeys: readonly string[];
}

/** A catalogued capability as the authorization and planning engines see it. */
export interface ToolView {
  readonly key: string;
  readonly status: string;
  readonly effect: ToolEffect;
  readonly riskLevel: RiskLevel;
  readonly reversibility: Reversibility;
  /** Set on the capability itself when it always needs a human, whatever the agent's autonomy. */
  readonly requiresApproval: boolean;
  /** The capability that undoes this one. Present exactly when `reversibility` is `compensatable`. */
  readonly compensationKey: string | null;
}

/**
 * The verdict of authorizing an agent to invoke a capability: what may happen, why, and what a rollback would
 * need. `reasons` are stable codes, sorted and de-duplicated — safe for an event, an audit trail and a UI.
 */
export interface AuthorizationDecision {
  readonly agentId: string;
  readonly capabilityKey: string;
  readonly outcome: AuthorizationOutcome;
  readonly reasons: readonly AuthorizationReason[];
  readonly riskLevel: RiskLevel;
  readonly reversibility: Reversibility;
  /** True when a successful invocation would have to be compensated to be undone. */
  readonly requiresCompensation: boolean;
}

// --- Plan inspection -------------------------------------------------------------

/** A plan step as the planning engine sees it: where it sits, what it invokes, and what it waits on. */
export interface PlanStepView {
  readonly id: string;
  readonly ordinal: number;
  readonly capabilityKey: string;
  readonly status: string;
  /** Ids of steps that must succeed first. A DAG — ordinals are reading order, these are the real order. */
  readonly dependsOn: readonly string[];
}

/** The stable issue codes plan inspection reports. */
export const PLAN_ISSUE_CODES = [
  "empty_plan",
  "unknown_capability",
  "capability_not_active",
  "duplicate_ordinal",
  "unknown_dependency",
  "self_dependency",
  "dependency_cycle",
] as const;
export type PlanIssueCode = (typeof PLAN_ISSUE_CODES)[number];

/** One thing wrong with a plan, located at the step that carries it (`stepId` null for whole-plan issues). */
export interface PlanIssue {
  readonly stepId: string | null;
  readonly code: PlanIssueCode;
  /** The capability or step id the issue refers to, when the code alone is not specific enough. */
  readonly ref: string | null;
}

/**
 * What inspecting a plan before it runs reveals: how big it is, the worst risk anywhere in it, whether it can
 * run unattended, what could not be undone if it went wrong, and everything structurally wrong with it. A plan
 * is inspectable *before* execution — that is the contract, and this is the shape of the inspection.
 */
export interface PlanInspection {
  readonly stepCount: number;
  readonly highestRisk: RiskLevel | null;
  readonly requiresApproval: boolean;
  readonly irreversibleStepIds: readonly string[];
  readonly compensatableStepIds: readonly string[];
  readonly issues: readonly PlanIssue[];
  /** True when the plan is structurally sound — no issues. Approval is a separate gate. */
  readonly sound: boolean;
}

/** How far through a plan execution has got. */
export interface PlanProgress {
  readonly total: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly skipped: number;
  readonly compensated: number;
  readonly outstanding: number;
  /** Percent of steps settled, 0–100 with two decimals. */
  readonly percentSettled: number;
  readonly complete: boolean;
}

// --- Rollback --------------------------------------------------------------------

/** An invocation as the rollback engine sees it. */
export interface InvocationView {
  readonly id: string;
  readonly stepId: string | null;
  readonly capabilityKey: string;
  readonly ordinal: number;
  readonly status: string;
  readonly reversibility: Reversibility;
  readonly compensationKey: string | null;
}

/** One undo: invoke `compensationKey` to reverse `invocationId`. Ordered by the rollback, not the plan. */
export interface CompensationStep {
  readonly invocationId: string;
  readonly capabilityKey: string;
  readonly compensationKey: string;
  /** Position in the rollback, 1-based — the reverse of the order the invocations succeeded in. */
  readonly ordinal: number;
}

/**
 * How to undo what a plan has already done: the compensating invocations in reverse order, and — honestly —
 * what cannot be undone at all. A rollback that meets an irreversible invocation stops there; it does not
 * pretend to have undone it.
 */
export interface CompensationPlan {
  readonly steps: readonly CompensationStep[];
  /** Invocation ids that succeeded and cannot be undone. Non-empty means the rollback is partial. */
  readonly irreversibleInvocationIds: readonly string[];
  readonly fullyReversible: boolean;
}

// --- Reasoning -------------------------------------------------------------------

/** A reasoning step as the reasoning engine sees it. */
export interface TraceView {
  readonly id: string;
  readonly ordinal: number;
  readonly kind: TraceKind;
  readonly confidence: number;
  /** Knowledge-graph references this step brought in (assertion / entity / relationship ids from P2-D25). */
  readonly knowledgeRefs: readonly string[];
  /** Ids of earlier trace steps this one rests on — the session's internal evidence chain. */
  readonly dependsOn: readonly string[];
}

/**
 * How well-founded a reasoning session is: how much it retrieved, how much it concluded, and how much of what
 * it concluded actually rests on something. An ungrounded inference is the failure mode this measures.
 */
export interface SessionGrounding {
  readonly traceCount: number;
  readonly retrievalCount: number;
  readonly derivedCount: number;
  readonly groundedDerivedCount: number;
  readonly ungroundedTraceIds: readonly string[];
  readonly knowledgeRefCount: number;
  /** True when every inference and decision in the session rests on earlier steps. */
  readonly grounded: boolean;
}

/** A descriptive picture of one reasoning session. */
export interface SessionSummary {
  readonly grounding: SessionGrounding;
  /** The weakest-link confidence over the session's decisions and what they rest on; 0 when ungrounded. */
  readonly decisionConfidence: number;
  readonly decisionCount: number;
}

// --- Metrics ---------------------------------------------------------------------

/** A key→count roll-up (plans by status, invocations by capability, …). */
export interface KeyCount {
  readonly key: string;
  readonly count: number;
}

/** A plan as the metrics engine sees it. */
export interface PlanView {
  readonly id: string;
  readonly agentId: string;
  readonly status: string;
}

/** An approval request as the metrics engine sees it. */
export interface ApprovalView {
  readonly id: string;
  readonly decision: string;
}

/**
 * An invocation as the metrics engine sees it — narrower than {@link InvocationView} because rolling back and
 * counting need different facts. `approvalRequestId` is what makes an invocation human-gated.
 */
export interface InvocationSummaryView {
  readonly id: string;
  readonly status: string;
  readonly approvalRequestId: string | null;
}

/**
 * A descriptive picture of a tenant's AI operations: what is registered, what is running, how much needed a
 * human and how much was undone. Counts and rates only — never content.
 */
export interface AgentOperationsSummary {
  readonly agentCount: number;
  readonly activeAgentCount: number;
  readonly capabilityCount: number;
  readonly planCount: number;
  readonly plansByStatus: readonly KeyCount[];
  readonly invocationCount: number;
  readonly compensatedInvocationCount: number;
  readonly approvalCount: number;
  readonly pendingApprovalCount: number;
  /** Approved as a percent of *decided* approvals, 0–100 with two decimals; 0 when none were decided. */
  readonly approvalRate: number;
  /** Invocations that needed a human as a percent of all invocations, 0–100 with two decimals. */
  readonly humanGatedRate: number;
}
