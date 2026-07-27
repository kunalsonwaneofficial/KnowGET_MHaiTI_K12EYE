/**
 * Value objects for the Enterprise AI Operating System (P2-D26). These are the vocabulary of the AI runtime:
 * what an agent is allowed to be, what a capability costs to invoke, how a plan and an invocation move, how a
 * human decision is recorded, and what a reasoning step may be. They are TEXT in the store and closed unions
 * here — the runtime's grammar is fixed even though the *catalog* (agent keys, capability keys) is extensible.
 *
 * Two of these unions are deliberately narrow, and the narrowness is the enforcement:
 * `RETRIEVAL_SOURCES` has exactly one member (`knowledge_graph`), so a reasoning step cannot record knowledge
 * that came from anywhere but P2-D25; and there is no provider, endpoint, model-vendor or credential vocabulary
 * anywhere in this package, because external AI providers are reached only through the Phase-3 AI integration
 * adapter (P3-D09) — the AI OS never calls a provider itself.
 */

// --- Keys ------------------------------------------------------------------------

/**
 * The canonical form of a registry key: trimmed and lower-cased. Agent keys and capability keys share one
 * grammar — dotted, lower-case, stable — because a grant is matched to a catalog entry by exact string, and a
 * grant that fails to match because of a stray capital is a security hole, not a typo.
 */
const normalizeKey = (key: string): string => key.trim().toLowerCase();

/** Normalize an agent key. */
export const normalizeAgentKey = (key: string): string => normalizeKey(key);

/** Normalize a capability key — the key a grant, a plan step and an invocation all refer to. */
export const normalizeCapabilityKey = (key: string): string => normalizeKey(key);

// --- Agent registry --------------------------------------------------------------

/**
 * The lifecycle of a registered agent: drafted, active (may be planned with), suspended (temporarily stopped —
 * reversible), retired (terminal). Only an `active` agent can be authorized to invoke anything.
 */
export const AGENT_STATUSES = ["draft", "active", "suspended", "retired"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

/**
 * How much an agent may do without a human in the loop, weakest first. `advisory` proposes and never executes;
 * `supervised` may perform unattended reads only; `bounded` may act unattended up to medium risk; `autonomous`
 * up to high risk. Nothing — at any level — executes a `critical` or an irreversible action unattended.
 */
export const AUTONOMY_LEVELS = ["advisory", "supervised", "bounded", "autonomous"] as const;
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

/** The rank of an autonomy level (0 = advisory). Used to compare levels, never to bypass a gate. */
export const autonomyRank = (level: AutonomyLevel): number => AUTONOMY_LEVELS.indexOf(level);

// --- Capability catalog ----------------------------------------------------------

/** The lifecycle of a catalogued capability (a "tool"): drafted, active, then deprecated. */
export const TOOL_STATUSES = ["draft", "active", "deprecated"] as const;
export type ToolStatus = (typeof TOOL_STATUSES)[number];

/** What invoking a capability does to institutional state: reads it, or changes it. */
export const TOOL_EFFECTS = ["read", "write"] as const;
export type ToolEffect = (typeof TOOL_EFFECTS)[number];

/** How much is at stake when a capability is invoked, lowest first. */
export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** The rank of a risk level (0 = low). */
export const riskRank = (level: RiskLevel): number => RISK_LEVELS.indexOf(level);

/**
 * Whether the effect of an invocation can be undone. `reversible` needs nothing; `compensatable` can be undone
 * by invoking a declared compensating capability; `irreversible` cannot be undone at all — so it always needs a
 * human, and a rollback that meets one can only stop there.
 */
export const REVERSIBILITIES = ["reversible", "compensatable", "irreversible"] as const;
export type Reversibility = (typeof REVERSIBILITIES)[number];

// --- Authorization ---------------------------------------------------------------

/**
 * The outcome of authorizing an agent to invoke a capability. `denied` is terminal — it is a *grant* failure,
 * and no human approval can substitute for a grant. `requires_approval` is the enforceable human gate.
 */
export const AUTHORIZATION_OUTCOMES = ["allowed", "requires_approval", "denied"] as const;
export type AuthorizationOutcome = (typeof AUTHORIZATION_OUTCOMES)[number];

/**
 * The stable reason codes an authorization decision carries. Codes, never prose: they are safe in an event, in
 * an audit record and in an API response, and they are what the approval UI and the tests assert on.
 */
export const AUTHORIZATION_REASONS = [
  "agent_not_active",
  "capability_not_granted",
  "tool_not_active",
  "autonomy_forbids_unattended_execution",
  "effect_exceeds_autonomy",
  "risk_exceeds_autonomy",
  "irreversible_action",
  "tool_requires_approval",
] as const;
export type AuthorizationReason = (typeof AUTHORIZATION_REASONS)[number];

/** The reasons that *deny* outright — a missing or withdrawn grant. Approval cannot rescue any of these. */
export const DENYING_REASONS: readonly AuthorizationReason[] = [
  "agent_not_active",
  "capability_not_granted",
  "tool_not_active",
];

/** Whether a reason denies outright (rather than raising the human-approval gate). */
export const isDenyingReason = (reason: AuthorizationReason): boolean =>
  DENYING_REASONS.includes(reason);

/**
 * The highest risk each autonomy level may execute unattended; `null` means "nothing unattended". `critical` is
 * absent from every entry on purpose — it is never unattended, at any level.
 */
export const MAX_UNATTENDED_RISK: Readonly<Record<AutonomyLevel, RiskLevel | null>> = {
  advisory: null,
  supervised: "low",
  bounded: "medium",
  autonomous: "high",
};

/** The effects each autonomy level may perform unattended. `advisory` performs none — it only proposes. */
export const UNATTENDED_EFFECTS: Readonly<Record<AutonomyLevel, readonly ToolEffect[]>> = {
  advisory: [],
  supervised: ["read"],
  bounded: ["read", "write"],
  autonomous: ["read", "write"],
};

// --- Execution plans -------------------------------------------------------------

/**
 * The lifecycle of an execution plan. A plan is drafted and *inspected* before it can move; it either runs
 * unattended (`approved` straight from draft when nothing gates it) or waits for a human (`awaiting_approval`).
 * `completed`, `failed`, `rolled_back`, `rejected` and `cancelled` are terminal.
 */
export const PLAN_STATUSES = [
  "drafted",
  "awaiting_approval",
  "approved",
  "rejected",
  "executing",
  "completed",
  "failed",
  "rolled_back",
  "cancelled",
] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** The plan statuses that are terminal — nothing moves out of them. */
export const TERMINAL_PLAN_STATUSES: readonly PlanStatus[] = [
  "rejected",
  "completed",
  "failed",
  "rolled_back",
  "cancelled",
];

/** Whether a plan status is terminal. */
export const isTerminalPlanStatus = (status: PlanStatus): boolean =>
  TERMINAL_PLAN_STATUSES.includes(status);

/**
 * The lifecycle of one step of a plan: pending, executing, then succeeded / failed / skipped, or `compensated`
 * once a rollback has undone a step that had succeeded.
 */
export const STEP_STATUSES = [
  "pending",
  "executing",
  "succeeded",
  "failed",
  "skipped",
  "compensated",
] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

/** The step statuses that are settled — the step will not run again in this plan. */
export const SETTLED_STEP_STATUSES: readonly StepStatus[] = [
  "succeeded",
  "failed",
  "skipped",
  "compensated",
];

/** Whether a step status is settled. Accepts a raw string — the engines read steps through narrow views. */
export const isSettledStepStatus = (status: string): boolean =>
  (SETTLED_STEP_STATUSES as readonly string[]).includes(status);

// --- Tool invocation -------------------------------------------------------------

/**
 * The lifecycle of a permission-controlled invocation: it is only ever created *authorized* (the decision is
 * taken before the record exists), then executes and settles, and a settled write may later be `compensated`
 * by its rollback.
 */
export const INVOCATION_STATUSES = [
  "authorized",
  "executing",
  "succeeded",
  "failed",
  "compensated",
] as const;
export type InvocationStatus = (typeof INVOCATION_STATUSES)[number];

// --- Human approval --------------------------------------------------------------

/** What a human approval request is about — a whole plan, or a single invocation. */
export const APPROVAL_SUBJECTS = ["execution_plan", "tool_invocation"] as const;
export type ApprovalSubject = (typeof APPROVAL_SUBJECTS)[number];

/** A human decision on a request: still pending, granted, refused, or timed out. All but `pending` terminal. */
export const APPROVAL_DECISIONS = ["pending", "approved", "rejected", "expired"] as const;
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

// --- Reasoning -------------------------------------------------------------------

/** The lifecycle of a reasoning session: open while it reasons, then concluded or abandoned. Both terminal. */
export const SESSION_STATUSES = ["open", "concluded", "abandoned"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/**
 * What one recorded step of reasoning is. `retrieval` brings knowledge in (and only from the graph);
 * `observation` records a fact the runtime saw; `inference` concludes from earlier steps; `decision` is what the
 * agent settled on. Inference and decision must rest on earlier steps — that is the session's evidence chain.
 */
export const TRACE_KINDS = ["retrieval", "observation", "inference", "decision"] as const;
export type TraceKind = (typeof TRACE_KINDS)[number];

/** The trace kinds that must cite earlier steps to be grounded. */
export const DERIVED_TRACE_KINDS: readonly TraceKind[] = ["inference", "decision"];

/** Whether a trace kind must cite earlier steps. */
export const isDerivedTraceKind = (kind: TraceKind): boolean => DERIVED_TRACE_KINDS.includes(kind);

/**
 * Where retrieved knowledge may originate. Exactly one member, on purpose: the contract requires that knowledge
 * retrieval originates from the Institutional Knowledge Graph (P2-D25), and a one-member union is how that is
 * held structurally rather than by convention — there is no vocabulary here for any other source.
 */
export const RETRIEVAL_SOURCES = ["knowledge_graph"] as const;
export type RetrievalSource = (typeof RETRIEVAL_SOURCES)[number];

/** The only retrieval source there is — the knowledge graph delivered by P2-D25. */
export const KNOWLEDGE_GRAPH_SOURCE: RetrievalSource = "knowledge_graph";

// --- Confidence ------------------------------------------------------------------

/** The confidence bounds — an integer 0–100 index, never a probability float. */
export const MIN_CONFIDENCE = 0;
export const MAX_CONFIDENCE = 100;

/** Clamp a confidence to the 0–100 integer band. */
export const clampConfidence = (value: number): number =>
  Math.max(MIN_CONFIDENCE, Math.min(MAX_CONFIDENCE, Math.floor(value)));
