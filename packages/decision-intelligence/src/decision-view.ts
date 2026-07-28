import type {
  ActionKind,
  AutonomyDisposition,
  AutonomyMode,
  AutonomyReason,
  CompensationState,
  EvidenceSource,
  EvidenceStrength,
  ImpactBand,
  Reversibility,
  RiskLevel,
  StageKind,
} from "./decision-value";

/**
 * Narrow read views the pure engines operate over. Each is the minimal shape an engine needs — never the full
 * aggregate — so the six engines (autonomy, evidence, orchestration, reversal, prioritization, metrics) are
 * built and tested before any aggregate or store depends on them, exactly as the platform's pure-engine-first
 * discipline requires.
 *
 * Every engine here is clock-free. Where time genuinely matters — a stage that has run past its SLA, a
 * recommendation that has gone stale — the moment to judge against is passed in as `asOf`, so the same inputs
 * always produce the same answer and a test never has to wait for a clock to move.
 */

// --- Autonomy --------------------------------------------------------------------

/**
 * An action as the autonomy engine sees it: what it would do, what is at stake, and whether there is a way
 * back. This is the whole input to "may this happen without a person" — deliberately not the rule, not the
 * subject and not the evidence, because those are separate reasons and the engine reports them separately.
 */
export interface ActionView {
  readonly kind: ActionKind;
  /** The capability key (P2-D26 catalog) or workflow key this action would request. Null for a proposal. */
  readonly targetKey: string | null;
  readonly riskLevel: RiskLevel;
  readonly reversibility: Reversibility;
  /** The capability that undoes this action. Required when `reversibility` is `compensatable`. */
  readonly compensationKey: string | null;
}

/** An automation rule as the autonomy engine sees it: whether it may fire at all, and how far it may go. */
export interface AutomationRuleView {
  readonly id: string;
  readonly key: string;
  readonly status: string;
  readonly autonomyMode: AutonomyMode;
  readonly action: ActionView;
}

/**
 * A recommendation as the autonomy gate sees it when a rule proposes to act on one. `grounded` comes from the
 * evidence engine, so the contract's second rule feeds the first: an ungrounded recommendation cannot be acted
 * on unattended, whatever its risk. `requiresHumanJudgement` is *declared* on the recommendation, not inferred
 * — some subjects (a safeguarding concern, a disciplinary matter) always belong to a person, and saying so
 * explicitly is more honest than trying to detect it from a domain name.
 */
export interface RecommendationGateView {
  readonly id: string;
  readonly status: string;
  readonly grounded: boolean;
  readonly requiresHumanJudgement: boolean;
}

/**
 * The verdict of the autonomy gate: what may happen, why, and what undoing it would take. `reasons` are stable
 * codes, sorted and de-duplicated — safe for an event, an accountability record and a UI.
 *
 * The three dispositions are not a severity scale, they are three different situations. `auto_execute` is the
 * unattended path and is reachable only below the risk ceiling with a way back. `requires_approval` is the
 * human gate — the action is well-formed and a person must own it. `blocked` means the *rule* is malformed
 * (inactive, irreversible, no declared compensation) and no approval will fix it, because approving an
 * unattended standing rule to do something it can never undo is not a decision a person should be offered.
 */
export interface AutonomyDecision {
  readonly ruleId: string;
  readonly targetKey: string | null;
  readonly disposition: AutonomyDisposition;
  readonly reasons: readonly AutonomyReason[];
  readonly riskLevel: RiskLevel;
  readonly reversibility: Reversibility;
  /** True when a successful action would have to be compensated to be undone. */
  readonly requiresCompensation: boolean;
  /** True when the compensating capability needed to undo this action is actually declared. */
  readonly compensationAvailable: boolean;
}

// --- Evidence --------------------------------------------------------------------

/**
 * One piece of evidence as the evidence engine sees it. `ref` is an opaque id in the source contract — a
 * knowledge entity, relationship or assertion (P2-D25), or a reasoning session (P2-D26). This domain never
 * re-models what it cites; it points at it.
 *
 * `supports` is what makes an evidence *chain* rather than an evidence *list*: a piece of evidence may name
 * other pieces it rests on, so a recommendation can say not only what it cites but how the citations hang
 * together. The engine walks that graph cycle-safely, because a chain that quietly loops is an argument that
 * proves itself.
 */
export interface EvidenceRefView {
  readonly id: string;
  readonly source: EvidenceSource;
  readonly ref: string;
  readonly strength: EvidenceStrength;
  /** Ids of other evidence in the same chain that this piece rests on. Empty for a root citation. */
  readonly supports: readonly string[];
}

/** A recommendation as the evidence engine sees it. */
export interface RecommendationEvidenceView {
  readonly id: string;
  readonly status: string;
  readonly evidence: readonly EvidenceRefView[];
}

/** The stable issue codes evidence inspection reports. */
export const EVIDENCE_ISSUE_CODES = [
  "no_evidence",
  "unknown_support",
  "self_support",
  "support_cycle",
  "no_graph_root",
] as const;
export type EvidenceIssueCode = (typeof EVIDENCE_ISSUE_CODES)[number];

/** One thing wrong with an evidence chain, located at the piece that carries it. */
export interface EvidenceIssue {
  readonly evidenceId: string | null;
  readonly code: EvidenceIssueCode;
  /** The evidence id the issue refers to, when the code alone is not specific enough. */
  readonly ref: string | null;
}

/**
 * How well-founded a recommendation is. `grounded` is the contract's second rule made measurable: there is
 * evidence, it forms a sound chain, and at least one root of that chain is the knowledge graph itself rather
 * than another layer of reasoning. `confidence` is the weakest link in the chain, never an average — an
 * argument is not made stronger by adding a strong citation next to a weak one it depends on.
 */
export interface EvidenceChainSummary {
  readonly evidenceCount: number;
  readonly rootCount: number;
  readonly graphRootCount: number;
  readonly sessionCount: number;
  readonly maxDepth: number;
  readonly issues: readonly EvidenceIssue[];
  /** The weakest strength anywhere in the chain, as a 0–100 confidence; 0 when the chain is unsound. */
  readonly confidence: number;
  readonly grounded: boolean;
}

// --- Workflow orchestration ------------------------------------------------------

/** A workflow stage as the orchestration engine sees it. */
export interface WorkflowStageView {
  readonly key: string;
  readonly ordinal: number;
  readonly kind: StageKind;
  /** The capability an `automated_action` stage would request. Null for every other kind. */
  readonly capabilityKey: string | null;
  readonly riskLevel: RiskLevel;
  readonly reversibility: Reversibility;
  readonly compensationKey: string | null;
  /** Keys of stages that must settle first. A DAG — ordinals are reading order, these are the real order. */
  readonly dependsOn: readonly string[];
  /** Hours after the stage begins at which it is overdue. Null when the stage carries no SLA. */
  readonly slaHours: number | null;
  readonly optional: boolean;
}

/** The stable issue codes workflow inspection reports. */
export const WORKFLOW_ISSUE_CODES = [
  "empty_workflow",
  "duplicate_stage_key",
  "duplicate_ordinal",
  "unknown_dependency",
  "self_dependency",
  "dependency_cycle",
  "missing_capability",
  "capability_on_non_acting_stage",
  "missing_compensation",
  "unreachable_stage",
] as const;
export type WorkflowIssueCode = (typeof WORKFLOW_ISSUE_CODES)[number];

/** One thing wrong with a workflow definition, located at the stage that carries it. */
export interface WorkflowIssue {
  readonly stageKey: string | null;
  readonly code: WorkflowIssueCode;
  readonly ref: string | null;
}

/**
 * What inspecting a workflow before it is published reveals: how big it is, the worst risk anywhere in it,
 * which stages could ever run unattended, which will always stop for a person, what could not be undone, and
 * everything structurally wrong with it. A definition is inspected *before* publication — that is the gate, and
 * this is the shape of the inspection.
 */
export interface WorkflowInspection {
  readonly stageCount: number;
  readonly highestRisk: RiskLevel | null;
  readonly autoExecutableStageKeys: readonly string[];
  readonly approvalGatedStageKeys: readonly string[];
  readonly irreversibleStageKeys: readonly string[];
  readonly compensatableStageKeys: readonly string[];
  readonly issues: readonly WorkflowIssue[];
  /** True when the definition is structurally sound — no issues. */
  readonly sound: boolean;
}

/** One stage of a running instance as the orchestration and reversal engines see it. */
export interface StageRunView {
  readonly stageKey: string;
  readonly ordinal: number;
  readonly status: string;
  /** When the stage began, ISO-8601. Null while pending. */
  readonly startedAt: string | null;
  readonly settledAt: string | null;
}

/** How far through a workflow instance execution has got. */
export interface InstanceProgress {
  readonly total: number;
  readonly completed: number;
  readonly skipped: number;
  readonly failed: number;
  readonly compensated: number;
  readonly outstanding: number;
  /** Percent of stages settled, 0–100 with two decimals. */
  readonly percentSettled: number;
  readonly complete: boolean;
}

/** A stage that has been active longer than its SLA allows, and who the definition escalates it to. */
export interface OverdueStage {
  readonly stageKey: string;
  readonly slaHours: number;
  /** Whole hours the stage has been active beyond its SLA, at the `asOf` moment the caller supplied. */
  readonly overdueByHours: number;
}

// --- Reversal --------------------------------------------------------------------

/** One undo: invoke `compensationKey` to reverse what `stageKey` did. Ordered by the reversal, not the flow. */
export interface ReversalStep {
  readonly stageKey: string;
  readonly capabilityKey: string;
  readonly compensationKey: string;
  /** Position in the reversal, 1-based — the reverse of the order the stages completed in. */
  readonly ordinal: number;
}

/**
 * How to undo what a workflow instance has already done: the compensating invocations in reverse order, and —
 * honestly — what cannot be undone at all. A reversal that meets an irreversible stage stops there; it does not
 * pretend to have undone it.
 */
export interface ReversalPlan {
  readonly steps: readonly ReversalStep[];
  /** Stage keys that completed and cannot be undone. Non-empty means the reversal is partial. */
  readonly irreversibleStageKeys: readonly string[];
  readonly fullyReversible: boolean;
  /** Completed stages that can be undone as a percent of completed stages, 0–100 with two decimals. */
  readonly reversibleShare: number;
}

// --- Prioritization --------------------------------------------------------------

/** A recommendation as the prioritization engine sees it. */
export interface RecommendationPriorityView {
  readonly id: string;
  readonly status: string;
  readonly impactBand: ImpactBand;
  readonly riskLevel: RiskLevel;
  readonly confidence: number;
  readonly createdAt: string;
  /** When the recommendation lapses if nobody answers it, ISO-8601. Null when it does not lapse. */
  readonly expiresAt: string | null;
}

/**
 * One recommendation placed in the queue, with the score that put it there and the parts that made the score.
 * The weight is *descriptive and declared* — reach, confidence and how close the window is to closing — not a
 * prediction of anything. Predictive intelligence is P2-D28; this is a sort order an administrator can check.
 */
export interface RankedRecommendation {
  readonly id: string;
  readonly score: number;
  readonly impactBand: ImpactBand;
  readonly riskLevel: RiskLevel;
  readonly confidence: number;
  /** Whole hours until expiry at the `asOf` moment; null when the recommendation does not lapse. */
  readonly hoursRemaining: number | null;
  readonly expired: boolean;
}

/** A descriptive picture of what is waiting to be decided. */
export interface DecisionBacklog {
  readonly openCount: number;
  readonly expiredCount: number;
  readonly byImpact: readonly KeyCount[];
  readonly byRisk: readonly KeyCount[];
  /** Open recommendations that require a human because their risk exceeds the auto-execution ceiling. */
  readonly humanGatedCount: number;
  readonly ranked: readonly RankedRecommendation[];
}

// --- Metrics ---------------------------------------------------------------------

/** A key→count roll-up (recommendations by status, runs by disposition, …). */
export interface KeyCount {
  readonly key: string;
  readonly count: number;
}

/** A recommendation as the metrics engine sees it. */
export interface RecommendationSummaryView {
  readonly id: string;
  readonly status: string;
  readonly riskLevel: RiskLevel;
}

/** A decision record as the metrics engine sees it. */
export interface DecisionSummaryView {
  readonly id: string;
  readonly disposition: string;
  readonly executionOutcome: string;
}

/** A workflow instance as the metrics engine sees it. */
export interface InstanceSummaryView {
  readonly id: string;
  readonly status: string;
}

/** An automation run as the metrics engine sees it. */
export interface RunSummaryView {
  readonly id: string;
  readonly status: string;
  readonly disposition: AutonomyDisposition;
  readonly compensationState: CompensationState;
}

/**
 * A descriptive picture of a tenant's decision operations: what was recommended, how much the machine decided
 * on its own, how much stopped for a person, how much was refused outright, and how much had to be undone.
 * Counts and rates only — never content, and never a projection.
 */
export interface DecisionOperationsSummary {
  readonly recommendationCount: number;
  readonly openRecommendationCount: number;
  readonly recommendationsByStatus: readonly KeyCount[];
  readonly decisionCount: number;
  readonly autonomousDecisionCount: number;
  readonly humanDecisionCount: number;
  readonly workflowCount: number;
  readonly instanceCount: number;
  readonly runningInstanceCount: number;
  readonly ruleCount: number;
  readonly runCount: number;
  readonly runsByDisposition: readonly KeyCount[];
  readonly blockedRunCount: number;
  readonly compensatedRunCount: number;
  /** Accepted as a percent of *answered* recommendations, 0–100 with two decimals; 0 when none were answered. */
  readonly acceptanceRate: number;
  /** Decisions the machine took as a percent of all decisions, 0–100 with two decimals. */
  readonly autonomyRate: number;
  /** Runs that stopped for a human as a percent of all runs, 0–100 with two decimals. */
  readonly humanGatedRate: number;
}
