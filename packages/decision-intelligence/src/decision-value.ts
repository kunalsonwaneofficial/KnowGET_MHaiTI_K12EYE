/**
 * Value objects for Institutional Decision Intelligence (P2-D27). These are the vocabulary of the decision
 * layer: what a recommendation may claim, where its evidence may come from, how much of a decision a machine
 * may take on its own, how a workflow and its run may move, and what an automation may do when it fires. They
 * are TEXT in the store and closed unions here — the grammar of a decision is fixed even though the *catalog*
 * (workflow keys, rule keys, capability keys, signal keys) is extensible.
 *
 * Three of these declarations are the contract's rules made structural, and each is deliberately narrow:
 *
 * - {@link AUTO_EXECUTION_RISK_CEILING} is `low`, and it is a single constant rather than a per-tenant setting,
 *   because "only low-risk actions auto-execute" is an invariant of the platform and not a preference of an
 *   institution. Nothing in this package can raise it.
 * - {@link EVIDENCE_SOURCES} has exactly two members, and both are upstream Program E contracts — the knowledge
 *   graph (P2-D25) and a reasoning session (P2-D26), which is itself graph-grounded. There is no vocabulary
 *   here for a query, a spreadsheet, a report or a model output, so a recommendation cannot cite one.
 * - {@link ACTION_KINDS} describes what an automation *requests*, never how it is performed. This package holds
 *   no dispatcher: execution is requested through the AI runtime (P2-D26), and external AI providers are
 *   reached only through the Phase-3 AI integration adapter (P3-D09).
 *
 * Prediction is absent for the same structural reason: there is no forecast, horizon, scenario or probability
 * vocabulary anywhere here, because predictive intelligence is P2-D28. A confidence in this package is always
 * *derived from evidence already recorded*, never projected forward.
 */

// --- Keys ------------------------------------------------------------------------

/**
 * The canonical form of a registry key: trimmed and lower-cased. Workflow keys, stage keys, rule keys, signal
 * keys and the capability keys this domain refers to all share one grammar, because a rule's action is matched
 * to a capability by exact string and a match that fails on a stray capital is a correctness hole, not a typo.
 */
const normalizeKey = (key: string): string => key.trim().toLowerCase();

/** Normalize a workflow definition key. */
export const normalizeWorkflowKey = (key: string): string => normalizeKey(key);

/** Normalize a workflow stage key — unique within one definition version. */
export const normalizeStageKey = (key: string): string => normalizeKey(key);

/** Normalize an automation rule key. */
export const normalizeRuleKey = (key: string): string => normalizeKey(key);

/** Normalize a trigger signal key — the opaque name of something the institution observed. */
export const normalizeSignalKey = (key: string): string => normalizeKey(key);

/**
 * Normalize a capability key. This domain never *invokes* a capability; it names one so the AI runtime
 * (P2-D26) can be asked to. The grammar is shared so the two catalogs line up exactly.
 */
export const normalizeCapabilityKey = (key: string): string => normalizeKey(key);

/**
 * Normalize a source-domain name (`attendance`, `fees`, `admissions`). A recommendation's subject is an opaque
 * reference into an operational domain, exactly as the knowledge graph's is: this domain never re-models the
 * record it is reasoning about.
 */
export const normalizeSourceDomain = (domain: string): string => normalizeKey(domain);

// --- Risk, impact and reversibility ----------------------------------------------

/**
 * How much is at stake in an action, lowest first. Shared vocabulary with the AI runtime's capability catalog
 * (P2-D26) on purpose: a recommendation's risk and the risk of the capability it would invoke are the same
 * scale, so the two gates cannot disagree about what `high` means.
 */
export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** The rank of a risk level (0 = low). Used to compare risk, never to bypass a gate. */
export const riskRank = (level: RiskLevel): number => RISK_LEVELS.indexOf(level);

/**
 * **The contract rule, as a constant.** Only actions at or below this risk level may execute unattended;
 * everything above it requires a human. It is `low`, it is not configurable, and no tenant setting, autonomy
 * mode or policy in this package can raise it — the autonomy engine reads this and nothing else for the risk
 * half of its decision.
 */
export const AUTO_EXECUTION_RISK_CEILING: RiskLevel = "low";

/** Whether a risk level is at or below the auto-execution ceiling. The whole of "only low-risk auto-executes". */
export const isWithinAutoExecutionRisk = (level: RiskLevel): boolean =>
  riskRank(level) <= riskRank(AUTO_EXECUTION_RISK_CEILING);

/**
 * How much of the institution an action touches, smallest first. Impact is *descriptive* — it is declared by
 * whoever raises the recommendation and used to order a backlog, never to compute a forecast. It is separate
 * from risk on purpose: a low-risk action can have institution-wide reach, and a critical-risk action can touch
 * one learner.
 */
export const IMPACT_BANDS = ["individual", "cohort", "department", "institution"] as const;
export type ImpactBand = (typeof IMPACT_BANDS)[number];

/** The rank of an impact band (0 = individual). */
export const impactRank = (band: ImpactBand): number => IMPACT_BANDS.indexOf(band);

/**
 * Whether the effect of an action can be undone. `reversible` needs nothing; `compensatable` is undone by
 * invoking a declared compensating capability; `irreversible` cannot be undone at all — and so, under this
 * contract, can never be automated.
 */
export const REVERSIBILITIES = ["reversible", "compensatable", "irreversible"] as const;
export type Reversibility = (typeof REVERSIBILITIES)[number];

// --- Autonomy --------------------------------------------------------------------

/**
 * What an automation rule is permitted to attempt at all, weakest first. `propose_only` raises a recommendation
 * and stops; `auto_with_approval` prepares the action and waits for the human gate; `auto_execute` asks to run
 * unattended — and only *asks*: the autonomy engine still applies the risk ceiling and the compensation rule,
 * so a mode is a ceiling on ambition, never a grant.
 */
export const AUTONOMY_MODES = ["propose_only", "auto_with_approval", "auto_execute"] as const;
export type AutonomyMode = (typeof AUTONOMY_MODES)[number];

/** The rank of an autonomy mode (0 = propose_only). */
export const autonomyModeRank = (mode: AutonomyMode): number => AUTONOMY_MODES.indexOf(mode);

/**
 * What the autonomy gate decided. `blocked` is terminal — the action may not proceed even with a human, because
 * something structural is wrong with it (an inactive rule, an undeclared compensation). `requires_approval` is
 * the human gate: the action is sound, and a person must say yes. `auto_execute` is the only unattended path.
 */
export const AUTONOMY_DISPOSITIONS = ["auto_execute", "requires_approval", "blocked"] as const;
export type AutonomyDisposition = (typeof AUTONOMY_DISPOSITIONS)[number];

/**
 * The stable reason codes an autonomy decision carries. Codes, never prose: they are safe in an event, in an
 * accountability record and in an API response, and they are what an operator's console and the tests assert
 * on.
 */
export const AUTONOMY_REASONS = [
  "rule_not_active",
  "mode_forbids_auto_execution",
  "risk_exceeds_auto_execution_ceiling",
  "irreversible_action",
  "compensation_not_declared",
  "recommendation_not_open",
  "evidence_missing",
  "subject_requires_human_judgement",
] as const;
export type AutonomyReason = (typeof AUTONOMY_REASONS)[number];

/**
 * The reasons that *block* outright rather than raising the human gate. An irreversible or uncompensated action
 * is not something a person can wave through **as an automation** — the rule itself is malformed, and the fix
 * is to declare the compensation or to run the action through the AI runtime's own approval path where a human
 * takes responsibility for a specific invocation rather than for an unattended standing rule.
 */
export const BLOCKING_AUTONOMY_REASONS: readonly AutonomyReason[] = [
  "rule_not_active",
  "irreversible_action",
  "compensation_not_declared",
  "recommendation_not_open",
  "evidence_missing",
];

/** Whether a reason blocks outright (rather than raising the human-approval gate). */
export const isBlockingAutonomyReason = (reason: AutonomyReason): boolean =>
  BLOCKING_AUTONOMY_REASONS.includes(reason);

// --- Evidence --------------------------------------------------------------------

/**
 * Where a piece of evidence may come from. Exactly two members, and both are upstream contracts of this same
 * program: `knowledge_graph` is an entity, relationship or assertion in P2-D25 (which already guarantees its
 * own evidence chain), and `reasoning_session` is a recorded session in P2-D26 (whose retrieval, in turn,
 * originates only from the graph). Nothing else is expressible, so "recommendations always ship with evidence
 * chains" cannot degrade into citing a query, a spreadsheet or a model's unsupported opinion.
 */
export const EVIDENCE_SOURCES = ["knowledge_graph", "reasoning_session"] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

/** The graph itself (P2-D25) — the root source every evidence chain reduces to. */
export const KNOWLEDGE_GRAPH_SOURCE: EvidenceSource = "knowledge_graph";

/** How strongly one piece of evidence supports what rests on it, weakest first. */
export const EVIDENCE_STRENGTHS = ["weak", "moderate", "strong"] as const;
export type EvidenceStrength = (typeof EVIDENCE_STRENGTHS)[number];

/** The rank of an evidence strength (0 = weak). */
export const evidenceStrengthRank = (strength: EvidenceStrength): number =>
  EVIDENCE_STRENGTHS.indexOf(strength);

/**
 * The confidence each strength contributes, as an integer 0–100 index. A chain is only as good as its weakest
 * link, so these are the values {@link EvidenceStrength} maps to before the weakest one is taken.
 */
export const EVIDENCE_STRENGTH_CONFIDENCE: Readonly<Record<EvidenceStrength, number>> = {
  weak: 30,
  moderate: 65,
  strong: 90,
};

// --- Recommendations -------------------------------------------------------------

/**
 * The lifecycle of a recommendation. `proposed` is open; `accepted` and `rejected` are the two human landings;
 * `superseded` is what a revision does to the recommendation it replaces; `expired` is what time does to one
 * nobody answered; `withdrawn` is the proposer taking it back. Only `proposed` is open — everything else is
 * terminal, because a decision that was already taken cannot be quietly re-taken.
 */
export const RECOMMENDATION_STATUSES = [
  "proposed",
  "accepted",
  "rejected",
  "superseded",
  "expired",
  "withdrawn",
] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

/** The recommendation statuses that are terminal — nothing moves out of them. */
export const TERMINAL_RECOMMENDATION_STATUSES: readonly RecommendationStatus[] = [
  "accepted",
  "rejected",
  "superseded",
  "expired",
  "withdrawn",
];

/** Whether a recommendation status is terminal. Accepts a raw string — engines read narrow views. */
export const isTerminalRecommendationStatus = (status: string): boolean =>
  (TERMINAL_RECOMMENDATION_STATUSES as readonly string[]).includes(status);

/** Whether a recommendation is still awaiting an answer. */
export const isOpenRecommendationStatus = (status: string): boolean => status === "proposed";

// --- Decisions -------------------------------------------------------------------

/**
 * How a decision was reached. `auto_executed` is the machine deciding within the autonomy gate — and is the
 * only disposition with no deciding person, which is exactly why it is named rather than left as a null. The
 * other three all had a human: they approved it, refused it, or put it off.
 */
export const DECISION_DISPOSITIONS = ["auto_executed", "approved", "rejected", "deferred"] as const;
export type DecisionDisposition = (typeof DECISION_DISPOSITIONS)[number];

/** Whether a disposition was taken by the machine rather than a person. */
export const isAutonomousDisposition = (disposition: DecisionDisposition): boolean =>
  disposition === "auto_executed";

/** What became of what a decision authorized. `not_started` until the runtime is asked to act. */
export const EXECUTION_OUTCOMES = [
  "not_started",
  "requested",
  "succeeded",
  "failed",
  "compensated",
] as const;
export type ExecutionOutcome = (typeof EXECUTION_OUTCOMES)[number];

// --- Workflow definitions --------------------------------------------------------

/**
 * The lifecycle of a workflow definition version: drafted and inspected, published (instances may start),
 * suspended (temporarily stopped — reversible), retired (terminal). A definition version is immutable once
 * published, because the instances running under it must keep meaning what they meant when they started.
 */
export const WORKFLOW_STATUSES = ["draft", "published", "suspended", "retired"] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

/**
 * What starts a workflow. `manual` is a person; `signal` is an observed institutional signal named by key;
 * `automation` is an automation rule asking for one. There is deliberately no `schedule` member: a timer is
 * platform machinery (P1-M05 jobs), not a decision, and putting one here would make this domain hold a clock.
 */
export const WORKFLOW_TRIGGERS = ["manual", "signal", "automation"] as const;
export type WorkflowTrigger = (typeof WORKFLOW_TRIGGERS)[number];

/**
 * What one stage of a workflow is. `human_task` waits for a person to do something; `decision` is a gate where
 * a recommendation is answered; `automated_action` asks the runtime to invoke a capability; `notification`
 * tells someone. Only `automated_action` can ever run unattended, and only then within the autonomy gate.
 */
export const STAGE_KINDS = ["human_task", "decision", "automated_action", "notification"] as const;
export type StageKind = (typeof STAGE_KINDS)[number];

/** The stage kinds that name a capability for the runtime to invoke. */
export const ACTING_STAGE_KINDS: readonly StageKind[] = ["automated_action"];

/** Whether a stage kind names a capability. */
export const isActingStageKind = (kind: StageKind): boolean => ACTING_STAGE_KINDS.includes(kind);

// --- Workflow instances ----------------------------------------------------------

/** The lifecycle of a running workflow instance. All but `running` are terminal. */
export const INSTANCE_STATUSES = ["running", "completed", "failed", "cancelled"] as const;
export type InstanceStatus = (typeof INSTANCE_STATUSES)[number];

/** The instance statuses that are terminal. */
export const TERMINAL_INSTANCE_STATUSES: readonly InstanceStatus[] = [
  "completed",
  "failed",
  "cancelled",
];

/** Whether an instance status is terminal. */
export const isTerminalInstanceStatus = (status: string): boolean =>
  (TERMINAL_INSTANCE_STATUSES as readonly string[]).includes(status);

/**
 * The lifecycle of one stage within a running instance: pending, active once begun, then completed / skipped /
 * failed, or `compensated` once a reversal has undone a stage that had completed.
 */
export const STAGE_RUN_STATUSES = [
  "pending",
  "active",
  "completed",
  "skipped",
  "failed",
  "compensated",
] as const;
export type StageRunStatus = (typeof STAGE_RUN_STATUSES)[number];

/** The stage-run statuses that are settled — the stage will not run again in this instance. */
export const SETTLED_STAGE_RUN_STATUSES: readonly StageRunStatus[] = [
  "completed",
  "skipped",
  "failed",
  "compensated",
];

/** Whether a stage-run status is settled. Accepts a raw string — engines read stages through narrow views. */
export const isSettledStageRunStatus = (status: string): boolean =>
  (SETTLED_STAGE_RUN_STATUSES as readonly string[]).includes(status);

/** Whether a stage-run status means the stage actually did its work (and so may need undoing). */
export const isCompletedStageRunStatus = (status: string): boolean => status === "completed";

// --- Automation rules ------------------------------------------------------------

/**
 * The lifecycle of an automation rule: drafted, active (may fire), paused (temporarily stopped — reversible),
 * retired (terminal). Only an `active` rule passes the autonomy gate at all.
 */
export const RULE_STATUSES = ["draft", "active", "paused", "retired"] as const;
export type RuleStatus = (typeof RULE_STATUSES)[number];

/**
 * What an automation rule *requests* when it fires. Every member is a request to another contract — invoke a
 * catalogued capability through the AI runtime (P2-D26), start one of this domain's workflows, or raise a
 * recommendation for a human. None of them is a dispatch: this package has no client, no transport and no
 * vocabulary for performing any of them itself.
 */
export const ACTION_KINDS = [
  "invoke_capability",
  "start_workflow",
  "raise_recommendation",
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

/** The action kinds that change institutional state and therefore need a declared way back. */
export const ACTING_ACTION_KINDS: readonly ActionKind[] = ["invoke_capability", "start_workflow"];

/** Whether an action kind changes institutional state. Raising a recommendation does not. */
export const isActingActionKind = (kind: ActionKind): boolean => ACTING_ACTION_KINDS.includes(kind);

/**
 * The comparison an automation condition may make. A closed, tiny grammar on purpose: conditions are *data*
 * that the engine evaluates, never an expression this domain compiles or runs. There is no `eval`, no script
 * host and no code path anywhere here that turns a stored string into behaviour.
 */
export const CONDITION_OPERATORS = [
  "equals",
  "not_equals",
  "greater_than",
  "less_than",
  "in",
  "not_in",
  "exists",
] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

// --- Automation runs -------------------------------------------------------------

/**
 * The lifecycle of one firing of a rule. A run is created already *gated* — the autonomy decision is taken
 * before the record exists — and then either waits for a human, executes, or stops. `blocked` records a firing
 * the gate refused, deliberately: a rule that keeps being refused is an operational fact worth keeping.
 */
export const RUN_STATUSES = [
  "gated",
  "awaiting_approval",
  "executing",
  "succeeded",
  "failed",
  "compensated",
  "blocked",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** The run statuses that are settled. */
export const SETTLED_RUN_STATUSES: readonly RunStatus[] = [
  "succeeded",
  "failed",
  "compensated",
  "blocked",
];

/** Whether a run status is settled. */
export const isSettledRunStatus = (status: string): boolean =>
  (SETTLED_RUN_STATUSES as readonly string[]).includes(status);

/**
 * Where a run stands on being undone. `not_required` is a read or a naturally reversible action; `available`
 * means a compensating capability is declared and has not been used; `compensated` means it was; `irreversible`
 * is the honest terminal state for something that got out and cannot be called back. The autonomy gate exists
 * so that `irreversible` is never reachable from an unattended run.
 */
export const COMPENSATION_STATES = [
  "not_required",
  "available",
  "compensated",
  "irreversible",
] as const;
export type CompensationState = (typeof COMPENSATION_STATES)[number];

// --- Confidence ------------------------------------------------------------------

/** The confidence bounds — an integer 0–100 index, never a probability float. */
export const MIN_CONFIDENCE = 0;
export const MAX_CONFIDENCE = 100;

/** Clamp a confidence to the 0–100 integer band. */
export const clampConfidence = (value: number): number =>
  Math.max(MIN_CONFIDENCE, Math.min(MAX_CONFIDENCE, Math.floor(value)));

/** Round a rate to two decimals, the platform's standing shape for a percentage. */
export const toRate = (numerator: number, denominator: number): number =>
  denominator === 0 ? 0 : Math.round((numerator / denominator) * 10000) / 100;
