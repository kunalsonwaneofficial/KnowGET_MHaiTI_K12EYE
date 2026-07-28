import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { AutonomyDisposition, AutonomyReason, ImpactBand, RiskLevel } from "./decision-value";
import { isActingStageKind } from "./decision-value";
import type { Recommendation } from "./recommendation";
import { isRecommendationGrounded } from "./recommendation";
import type { DecisionRecord } from "./decision-record";
import type { WorkflowDefinition } from "./workflow";
import type { WorkflowInstance, StageRun } from "./workflow-instance";
import { workflowInstanceProgress } from "./workflow-instance";
import type { AutomationRule } from "./automation-rule";
import { classifyRuleAction } from "./automation-rule";
import type { AutomationRun } from "./automation-run";

/**
 * Domain events for Institutional Decision Intelligence (P2-D27), on the `decision.*` namespace.
 *
 * Payloads carry ids, registry keys, statuses, stable reason codes, risk classifications and counts — and
 * nothing else. Every piece of free text this domain holds stays in the domain: a recommendation's `title` and
 * `summary`, a decision's `decisionNote`, a resolution's `resolutionNote`, a stage's `note`, a cancellation's
 * `cancellationReason`, an approval's `approvalNote`, and every `executionError`. So does every member of
 * staff: `proposedByUserId`, `resolvedByUserId`, `decidedByUserId`, `publishedByUserId`, `approvedByUserId`
 * and `rejectedByUserId` are on the record, not on the wire. Accountability belongs in the audit trail, where
 * it is read deliberately and within-tenant; an event is broadcast, and broadcasting who approved what is how
 * an operational feed becomes a surveillance feed. A subscriber that genuinely needs the deciding person
 * resolves it from the decision id.
 *
 * The subject — `subjectDomain` and `subjectId` — does travel, because without it a subscriber cannot route
 * anything: an attendance event that will not say which case it is about is a notification with nowhere to go.
 * A subject id is an opaque reference into another contract, scoped to the tenant the event is already scoped
 * to. It is not a name, an address or a record; anything readable about the subject stays where it lives.
 *
 * What an automation rule *observed* is likewise absent. A run's `observedFacts` are institutional facts about
 * the subject — an absence streak, an outstanding balance — and putting the values on a broadcast channel
 * would leak the very data the rule exists to act on discreetly. The condition *keys* are countable and the
 * verdict travels; the readings do not.
 *
 * Three events here are not the echo of a state change a person asked for. {@link recommendationExpired} fires
 * when nobody answered, {@link automationRunFired} fires when a standing rule decided by itself, and
 * {@link automationRunCompensated} fires when something had to be put back. Those are the moments an
 * institution most needs to see and the ones nobody is sitting at a screen for, so each carries the autonomy
 * gate's reason codes and the compensation state alongside the status — "what did this platform do on its own
 * last night, and what did it have to undo" is answerable from the event stream, not only from a log line
 * somebody thought to write.
 */

// --- Recommendations -------------------------------------------------------------
export const RECOMMENDATION_RAISED = "decision.recommendation.raised";
export const RECOMMENDATION_EVIDENCE_ADDED = "decision.recommendation.evidence_added";
export const RECOMMENDATION_EVIDENCE_RETRACTED = "decision.recommendation.evidence_retracted";
export const RECOMMENDATION_ACCEPTED = "decision.recommendation.accepted";
export const RECOMMENDATION_REJECTED = "decision.recommendation.rejected";
export const RECOMMENDATION_SUPERSEDED = "decision.recommendation.superseded";
export const RECOMMENDATION_EXPIRED = "decision.recommendation.expired";
export const RECOMMENDATION_WITHDRAWN = "decision.recommendation.withdrawn";

export interface RecommendationEventPayload {
  readonly recommendationId: Uuid;
  readonly organizationId: Uuid;
  readonly subjectDomain: string;
  readonly subjectId: string;
  readonly impactBand: ImpactBand;
  readonly riskLevel: RiskLevel;
  readonly requiresHumanJudgement: boolean;
  readonly status: string;
  readonly evidenceCount: number;
  /** Derived from the chain — the weakest link, 0–100. */
  readonly confidence: number;
  /** Whether the chain would carry the recommendation through the autonomy gate. */
  readonly grounded: boolean;
  /** The automation rule that raised it, when a rule did. Null when a person did. */
  readonly raisedByRuleId: string | null;
  /** The recommendation that replaced this one. Non-null only on a supersession. */
  readonly supersededById: Uuid | null;
}

export type RecommendationRaisedEvent = DomainEvent<
  typeof RECOMMENDATION_RAISED,
  RecommendationEventPayload
>;
export type RecommendationEvidenceAddedEvent = DomainEvent<
  typeof RECOMMENDATION_EVIDENCE_ADDED,
  RecommendationEventPayload
>;
export type RecommendationEvidenceRetractedEvent = DomainEvent<
  typeof RECOMMENDATION_EVIDENCE_RETRACTED,
  RecommendationEventPayload
>;
export type RecommendationAcceptedEvent = DomainEvent<
  typeof RECOMMENDATION_ACCEPTED,
  RecommendationEventPayload
>;
export type RecommendationRejectedEvent = DomainEvent<
  typeof RECOMMENDATION_REJECTED,
  RecommendationEventPayload
>;
export type RecommendationSupersededEvent = DomainEvent<
  typeof RECOMMENDATION_SUPERSEDED,
  RecommendationEventPayload
>;
export type RecommendationExpiredEvent = DomainEvent<
  typeof RECOMMENDATION_EXPIRED,
  RecommendationEventPayload
>;
export type RecommendationWithdrawnEvent = DomainEvent<
  typeof RECOMMENDATION_WITHDRAWN,
  RecommendationEventPayload
>;

// `grounded` and `confidence` travel on every recommendation event, not only the evidence ones. Whether a
// recommendation is still standing on anything is the question a subscriber asks of it at any moment, and
// making that answerable only by replaying the evidence events would make the cheap question expensive.
const recommendationPayload = (recommendation: Recommendation): RecommendationEventPayload => ({
  recommendationId: recommendation.id,
  organizationId: recommendation.organizationId,
  subjectDomain: recommendation.subjectDomain,
  subjectId: recommendation.subjectId,
  impactBand: recommendation.impactBand,
  riskLevel: recommendation.riskLevel,
  requiresHumanJudgement: recommendation.requiresHumanJudgement,
  status: recommendation.status,
  evidenceCount: recommendation.evidence.length,
  confidence: recommendation.confidence,
  grounded: isRecommendationGrounded(recommendation),
  raisedByRuleId: recommendation.raisedByRuleId,
  supersededById: recommendation.supersededById,
});

export const recommendationRaised = (r: Recommendation): RecommendationRaisedEvent =>
  createEvent(RECOMMENDATION_RAISED, recommendationPayload(r), { tenantId: r.tenantId });
export const recommendationEvidenceAdded = (r: Recommendation): RecommendationEvidenceAddedEvent =>
  createEvent(RECOMMENDATION_EVIDENCE_ADDED, recommendationPayload(r), { tenantId: r.tenantId });
export const recommendationEvidenceRetracted = (
  r: Recommendation,
): RecommendationEvidenceRetractedEvent =>
  createEvent(RECOMMENDATION_EVIDENCE_RETRACTED, recommendationPayload(r), {
    tenantId: r.tenantId,
  });
export const recommendationAccepted = (r: Recommendation): RecommendationAcceptedEvent =>
  createEvent(RECOMMENDATION_ACCEPTED, recommendationPayload(r), { tenantId: r.tenantId });
export const recommendationRejected = (r: Recommendation): RecommendationRejectedEvent =>
  createEvent(RECOMMENDATION_REJECTED, recommendationPayload(r), { tenantId: r.tenantId });
export const recommendationSuperseded = (r: Recommendation): RecommendationSupersededEvent =>
  createEvent(RECOMMENDATION_SUPERSEDED, recommendationPayload(r), { tenantId: r.tenantId });

/** Nobody answered. Emitted by the sweep, so no person and no decision record stands behind it. */
export const recommendationExpired = (r: Recommendation): RecommendationExpiredEvent =>
  createEvent(RECOMMENDATION_EXPIRED, recommendationPayload(r), { tenantId: r.tenantId });
export const recommendationWithdrawn = (r: Recommendation): RecommendationWithdrawnEvent =>
  createEvent(RECOMMENDATION_WITHDRAWN, recommendationPayload(r), { tenantId: r.tenantId });

// --- Decision records ------------------------------------------------------------
export const DECISION_RECORDED = "decision.record.recorded";
export const DECISION_EXECUTION_REQUESTED = "decision.record.execution_requested";
export const DECISION_EXECUTION_COMPLETED = "decision.record.execution_completed";
export const DECISION_EXECUTION_FAILED = "decision.record.execution_failed";
export const DECISION_COMPENSATED = "decision.record.compensated";

export interface DecisionEventPayload {
  readonly decisionId: Uuid;
  readonly organizationId: Uuid;
  readonly recommendationId: Uuid;
  readonly disposition: string;
  /** True exactly when no person stands behind this — the machine decided it. */
  readonly autonomous: boolean;
  readonly confidenceAtDecision: number;
  readonly riskLevelAtDecision: RiskLevel;
  readonly impactBandAtDecision: ImpactBand;
  readonly evidenceCount: number;
  /** The autonomy gate's stable codes, as they stood when the gate ran. */
  readonly autonomyReasons: readonly AutonomyReason[];
  /** What the decision authorizes. Null when it authorizes nothing — a judgement, not an act. */
  readonly actionKind: string | null;
  readonly actionTargetKey: string | null;
  readonly actionReversibility: string | null;
  readonly executionOutcome: string;
  /** The runtime invocation or workflow instance this was carried out as. Null until requested. */
  readonly executionRef: string | null;
  readonly compensationState: string;
  readonly compensationRef: string | null;
}

export type DecisionRecordedEvent = DomainEvent<typeof DECISION_RECORDED, DecisionEventPayload>;
export type DecisionExecutionRequestedEvent = DomainEvent<
  typeof DECISION_EXECUTION_REQUESTED,
  DecisionEventPayload
>;
export type DecisionExecutionCompletedEvent = DomainEvent<
  typeof DECISION_EXECUTION_COMPLETED,
  DecisionEventPayload
>;
export type DecisionExecutionFailedEvent = DomainEvent<
  typeof DECISION_EXECUTION_FAILED,
  DecisionEventPayload
>;
export type DecisionCompensatedEvent = DomainEvent<
  typeof DECISION_COMPENSATED,
  DecisionEventPayload
>;

// `autonomous` is carried as a flag rather than left to be inferred from the absent `decidedByUserId`, because
// the deciding user is exactly what this payload will not say. A subscriber counting how much of an
// institution's week the machine decided by itself should not have to reason from a hole in the data.
const decisionPayload = (decision: DecisionRecord): DecisionEventPayload => ({
  decisionId: decision.id,
  organizationId: decision.organizationId,
  recommendationId: decision.recommendationId,
  disposition: decision.disposition,
  autonomous: decision.decidedByUserId === null,
  confidenceAtDecision: decision.confidenceAtDecision,
  riskLevelAtDecision: decision.riskLevelAtDecision,
  impactBandAtDecision: decision.impactBandAtDecision,
  evidenceCount: decision.evidenceIds.length,
  autonomyReasons: decision.autonomyReasons,
  actionKind: decision.action?.kind ?? null,
  actionTargetKey: decision.action?.targetKey ?? null,
  actionReversibility: decision.action?.reversibility ?? null,
  executionOutcome: decision.executionOutcome,
  executionRef: decision.executionRef,
  compensationState: decision.compensationState,
  compensationRef: decision.compensationRef,
});

export const decisionRecorded = (d: DecisionRecord): DecisionRecordedEvent =>
  createEvent(DECISION_RECORDED, decisionPayload(d), { tenantId: d.tenantId });
export const decisionExecutionRequested = (d: DecisionRecord): DecisionExecutionRequestedEvent =>
  createEvent(DECISION_EXECUTION_REQUESTED, decisionPayload(d), { tenantId: d.tenantId });
export const decisionExecutionCompleted = (d: DecisionRecord): DecisionExecutionCompletedEvent =>
  createEvent(DECISION_EXECUTION_COMPLETED, decisionPayload(d), { tenantId: d.tenantId });

/** The error itself stays on the record — a failure message is prose, and prose does not broadcast. */
export const decisionExecutionFailed = (d: DecisionRecord): DecisionExecutionFailedEvent =>
  createEvent(DECISION_EXECUTION_FAILED, decisionPayload(d), { tenantId: d.tenantId });
export const decisionCompensated = (d: DecisionRecord): DecisionCompensatedEvent =>
  createEvent(DECISION_COMPENSATED, decisionPayload(d), { tenantId: d.tenantId });

// --- Workflow definitions --------------------------------------------------------
export const WORKFLOW_DRAFTED = "decision.workflow.drafted";
export const WORKFLOW_AMENDED = "decision.workflow.amended";
export const WORKFLOW_PUBLISHED = "decision.workflow.published";
export const WORKFLOW_SUSPENDED = "decision.workflow.suspended";
export const WORKFLOW_RESUMED = "decision.workflow.resumed";
export const WORKFLOW_RETIRED = "decision.workflow.retired";
export const WORKFLOW_REVISED = "decision.workflow.revised";

export interface WorkflowEventPayload {
  readonly workflowId: Uuid;
  readonly organizationId: Uuid;
  readonly key: string;
  readonly version: number;
  readonly trigger: string;
  readonly triggerSignalKey: string | null;
  readonly status: string;
  readonly stageCount: number;
  /** Stages that would act on the institution rather than ask a person — the ones worth watching. */
  readonly automatedStageCount: number;
}

export type WorkflowDraftedEvent = DomainEvent<typeof WORKFLOW_DRAFTED, WorkflowEventPayload>;
export type WorkflowAmendedEvent = DomainEvent<typeof WORKFLOW_AMENDED, WorkflowEventPayload>;
export type WorkflowPublishedEvent = DomainEvent<typeof WORKFLOW_PUBLISHED, WorkflowEventPayload>;
export type WorkflowSuspendedEvent = DomainEvent<typeof WORKFLOW_SUSPENDED, WorkflowEventPayload>;
export type WorkflowResumedEvent = DomainEvent<typeof WORKFLOW_RESUMED, WorkflowEventPayload>;
export type WorkflowRetiredEvent = DomainEvent<typeof WORKFLOW_RETIRED, WorkflowEventPayload>;
export type WorkflowRevisedEvent = DomainEvent<typeof WORKFLOW_REVISED, WorkflowEventPayload>;

// The version travels on every workflow event because the key alone does not identify a process here: a
// published version and the draft revising it share a key, and a subscriber told only "the key changed" cannot
// tell whether anything running was affected.
const workflowPayload = (workflow: WorkflowDefinition): WorkflowEventPayload => ({
  workflowId: workflow.id,
  organizationId: workflow.organizationId,
  key: workflow.key,
  version: workflow.version,
  trigger: workflow.trigger,
  triggerSignalKey: workflow.triggerSignalKey,
  status: workflow.status,
  stageCount: workflow.stages.length,
  automatedStageCount: workflow.stages.filter((stage) => isActingStageKind(stage.kind)).length,
});

export const workflowDrafted = (w: WorkflowDefinition): WorkflowDraftedEvent =>
  createEvent(WORKFLOW_DRAFTED, workflowPayload(w), { tenantId: w.tenantId });
export const workflowAmended = (w: WorkflowDefinition): WorkflowAmendedEvent =>
  createEvent(WORKFLOW_AMENDED, workflowPayload(w), { tenantId: w.tenantId });
export const workflowPublished = (w: WorkflowDefinition): WorkflowPublishedEvent =>
  createEvent(WORKFLOW_PUBLISHED, workflowPayload(w), { tenantId: w.tenantId });
export const workflowSuspended = (w: WorkflowDefinition): WorkflowSuspendedEvent =>
  createEvent(WORKFLOW_SUSPENDED, workflowPayload(w), { tenantId: w.tenantId });
export const workflowResumed = (w: WorkflowDefinition): WorkflowResumedEvent =>
  createEvent(WORKFLOW_RESUMED, workflowPayload(w), { tenantId: w.tenantId });
export const workflowRetired = (w: WorkflowDefinition): WorkflowRetiredEvent =>
  createEvent(WORKFLOW_RETIRED, workflowPayload(w), { tenantId: w.tenantId });

/** Carries the *new* draft, not the published version it came from — the revision is what is new. */
export const workflowRevised = (w: WorkflowDefinition): WorkflowRevisedEvent =>
  createEvent(WORKFLOW_REVISED, workflowPayload(w), { tenantId: w.tenantId });

// --- Workflow instances ----------------------------------------------------------
export const INSTANCE_STARTED = "decision.workflow_instance.started";
export const INSTANCE_STAGE_BEGUN = "decision.workflow_instance.stage_begun";
export const INSTANCE_STAGE_COMPLETED = "decision.workflow_instance.stage_completed";
export const INSTANCE_STAGE_SKIPPED = "decision.workflow_instance.stage_skipped";
export const INSTANCE_STAGE_FAILED = "decision.workflow_instance.stage_failed";
export const INSTANCE_STAGE_COMPENSATED = "decision.workflow_instance.stage_compensated";
export const INSTANCE_COMPLETED = "decision.workflow_instance.completed";
export const INSTANCE_FAILED = "decision.workflow_instance.failed";
export const INSTANCE_CANCELLED = "decision.workflow_instance.cancelled";

export interface InstanceEventPayload {
  readonly instanceId: Uuid;
  readonly organizationId: Uuid;
  readonly workflowId: Uuid;
  readonly workflowKey: string;
  readonly workflowVersion: number;
  readonly subjectDomain: string;
  readonly subjectId: string;
  readonly trigger: string;
  /** The automation rule that started it, when a rule did. Null when a person or a signal did. */
  readonly triggeredByRuleId: string | null;
  readonly recommendationId: Uuid | null;
  readonly status: string;
  readonly stageCount: number;
  readonly completedStageCount: number;
  readonly outstandingStageCount: number;
  /** The stage the case stopped at. Non-null only for a failed instance. */
  readonly failureStageKey: string | null;
}

/**
 * What a stage event broadcasts on top of its instance. Emitted only for a stage that actually moved, so the
 * stage key on the payload is always a stage of this instance — a subscriber never has to guess.
 */
export interface StageEventPayload extends InstanceEventPayload {
  readonly stageKey: string;
  readonly stageKind: string;
  readonly stageStatus: string;
  /** The AI runtime's reference for the invocation this stage requested (P2-D26). Null for a human stage. */
  readonly stageExecutionRef: string | null;
}

export type InstanceStartedEvent = DomainEvent<typeof INSTANCE_STARTED, InstanceEventPayload>;
export type InstanceCompletedEvent = DomainEvent<typeof INSTANCE_COMPLETED, InstanceEventPayload>;
export type InstanceFailedEvent = DomainEvent<typeof INSTANCE_FAILED, InstanceEventPayload>;
export type InstanceCancelledEvent = DomainEvent<typeof INSTANCE_CANCELLED, InstanceEventPayload>;
export type InstanceStageBegunEvent = DomainEvent<typeof INSTANCE_STAGE_BEGUN, StageEventPayload>;
export type InstanceStageCompletedEvent = DomainEvent<
  typeof INSTANCE_STAGE_COMPLETED,
  StageEventPayload
>;
export type InstanceStageSkippedEvent = DomainEvent<
  typeof INSTANCE_STAGE_SKIPPED,
  StageEventPayload
>;
export type InstanceStageFailedEvent = DomainEvent<typeof INSTANCE_STAGE_FAILED, StageEventPayload>;
export type InstanceStageCompensatedEvent = DomainEvent<
  typeof INSTANCE_STAGE_COMPENSATED,
  StageEventPayload
>;

// Progress travels as three counts rather than a percentage. A percentage is a presentation decision, and a
// subscriber that wants one can divide; a subscriber that wants to know how many stages are still outstanding
// cannot recover that from a rounded rate.
const instancePayload = (instance: WorkflowInstance): InstanceEventPayload => {
  const progress = workflowInstanceProgress(instance);
  return {
    instanceId: instance.id,
    organizationId: instance.organizationId,
    workflowId: instance.workflowId,
    workflowKey: instance.workflowKey,
    workflowVersion: instance.workflowVersion,
    subjectDomain: instance.subjectDomain,
    subjectId: instance.subjectId,
    trigger: instance.trigger,
    triggeredByRuleId: instance.triggeredByRuleId,
    recommendationId: instance.recommendationId,
    status: instance.status,
    stageCount: progress.total,
    completedStageCount: progress.completed,
    outstandingStageCount: progress.outstanding,
    failureStageKey: instance.failureStageKey,
  };
};

const stagePayload = (instance: WorkflowInstance, run: StageRun): StageEventPayload => ({
  ...instancePayload(instance),
  stageKey: run.stageKey,
  stageKind: run.kind,
  stageStatus: run.status,
  stageExecutionRef: run.executionRef,
});

export const instanceStarted = (i: WorkflowInstance): InstanceStartedEvent =>
  createEvent(INSTANCE_STARTED, instancePayload(i), { tenantId: i.tenantId });
export const instanceCompleted = (i: WorkflowInstance): InstanceCompletedEvent =>
  createEvent(INSTANCE_COMPLETED, instancePayload(i), { tenantId: i.tenantId });
export const instanceFailed = (i: WorkflowInstance): InstanceFailedEvent =>
  createEvent(INSTANCE_FAILED, instancePayload(i), { tenantId: i.tenantId });
export const instanceCancelled = (i: WorkflowInstance): InstanceCancelledEvent =>
  createEvent(INSTANCE_CANCELLED, instancePayload(i), { tenantId: i.tenantId });

export const instanceStageBegun = (i: WorkflowInstance, run: StageRun): InstanceStageBegunEvent =>
  createEvent(INSTANCE_STAGE_BEGUN, stagePayload(i, run), { tenantId: i.tenantId });
export const instanceStageCompleted = (
  i: WorkflowInstance,
  run: StageRun,
): InstanceStageCompletedEvent =>
  createEvent(INSTANCE_STAGE_COMPLETED, stagePayload(i, run), { tenantId: i.tenantId });
export const instanceStageSkipped = (
  i: WorkflowInstance,
  run: StageRun,
): InstanceStageSkippedEvent =>
  createEvent(INSTANCE_STAGE_SKIPPED, stagePayload(i, run), { tenantId: i.tenantId });
export const instanceStageFailed = (i: WorkflowInstance, run: StageRun): InstanceStageFailedEvent =>
  createEvent(INSTANCE_STAGE_FAILED, stagePayload(i, run), { tenantId: i.tenantId });

/** A stage has been put back. The compensating capability travels on the run's `stageExecutionRef`. */
export const instanceStageCompensated = (
  i: WorkflowInstance,
  run: StageRun,
): InstanceStageCompensatedEvent =>
  createEvent(INSTANCE_STAGE_COMPENSATED, stagePayload(i, run), { tenantId: i.tenantId });

// --- Automation rules ------------------------------------------------------------
export const RULE_DRAFTED = "decision.automation_rule.drafted";
export const RULE_AMENDED = "decision.automation_rule.amended";
export const RULE_ACTIVATED = "decision.automation_rule.activated";
export const RULE_PAUSED = "decision.automation_rule.paused";
export const RULE_RETIRED = "decision.automation_rule.retired";

export interface RuleEventPayload {
  readonly ruleId: Uuid;
  readonly organizationId: Uuid;
  readonly key: string;
  readonly signalKey: string;
  readonly status: string;
  readonly autonomyMode: string;
  readonly conditionCount: number;
  readonly actionKind: string;
  readonly actionTargetKey: string | null;
  readonly actionRiskLevel: RiskLevel;
  readonly actionReversibility: string;
  /** Whether the capability that would undo this action is actually declared. */
  readonly compensationDeclared: boolean;
  /** How far this rule may go right now, as the autonomy gate sees it. */
  readonly disposition: AutonomyDisposition;
  readonly reasons: readonly AutonomyReason[];
}

export type RuleDraftedEvent = DomainEvent<typeof RULE_DRAFTED, RuleEventPayload>;
export type RuleAmendedEvent = DomainEvent<typeof RULE_AMENDED, RuleEventPayload>;
export type RuleActivatedEvent = DomainEvent<typeof RULE_ACTIVATED, RuleEventPayload>;
export type RulePausedEvent = DomainEvent<typeof RULE_PAUSED, RuleEventPayload>;
export type RuleRetiredEvent = DomainEvent<typeof RULE_RETIRED, RuleEventPayload>;

// The gate's verdict travels with every rule event, including the drafts that could never pass it. A standing
// rule is the one thing in this domain that acts without anyone present, so "what would this rule be allowed
// to do" is the question a reviewer asks of it at every stage of its life, not only at activation.
const rulePayload = (rule: AutomationRule): RuleEventPayload => {
  const decision = classifyRuleAction(rule);
  return {
    ruleId: rule.id,
    organizationId: rule.organizationId,
    key: rule.key,
    signalKey: rule.signalKey,
    status: rule.status,
    autonomyMode: rule.autonomyMode,
    conditionCount: rule.conditions.length,
    actionKind: rule.action.kind,
    actionTargetKey: rule.action.targetKey,
    actionRiskLevel: rule.action.riskLevel,
    actionReversibility: rule.action.reversibility,
    compensationDeclared: rule.action.compensationKey !== null,
    disposition: decision.disposition,
    reasons: decision.reasons,
  };
};

export const ruleDrafted = (r: AutomationRule): RuleDraftedEvent =>
  createEvent(RULE_DRAFTED, rulePayload(r), { tenantId: r.tenantId });
export const ruleAmended = (r: AutomationRule): RuleAmendedEvent =>
  createEvent(RULE_AMENDED, rulePayload(r), { tenantId: r.tenantId });

/** The moment a rule gains the standing to act unattended. The one a security reviewer most wants to see. */
export const ruleActivated = (r: AutomationRule): RuleActivatedEvent =>
  createEvent(RULE_ACTIVATED, rulePayload(r), { tenantId: r.tenantId });
export const rulePaused = (r: AutomationRule): RulePausedEvent =>
  createEvent(RULE_PAUSED, rulePayload(r), { tenantId: r.tenantId });
export const ruleRetired = (r: AutomationRule): RuleRetiredEvent =>
  createEvent(RULE_RETIRED, rulePayload(r), { tenantId: r.tenantId });

// --- Automation runs -------------------------------------------------------------
export const RUN_FIRED = "decision.automation_run.fired";
export const RUN_APPROVED = "decision.automation_run.approved";
export const RUN_REJECTED = "decision.automation_run.rejected";
export const RUN_EXECUTION_STARTED = "decision.automation_run.execution_started";
export const RUN_SUCCEEDED = "decision.automation_run.succeeded";
export const RUN_FAILED = "decision.automation_run.failed";
export const RUN_COMPENSATED = "decision.automation_run.compensated";

export interface RunEventPayload {
  readonly runId: Uuid;
  readonly organizationId: Uuid;
  readonly ruleId: Uuid;
  readonly ruleKey: string;
  readonly signalKey: string;
  readonly subjectDomain: string;
  readonly subjectId: string;
  readonly recommendationId: Uuid | null;
  readonly autonomyMode: string;
  readonly disposition: AutonomyDisposition;
  readonly reasons: readonly AutonomyReason[];
  readonly status: string;
  readonly actionKind: string;
  readonly actionTargetKey: string | null;
  readonly actionRiskLevel: RiskLevel;
  readonly actionReversibility: string;
  /** How many of the rule's conditions were read to reach this verdict. Never the readings themselves. */
  readonly observedFactCount: number;
  readonly compensationState: string;
  readonly executionRef: string | null;
  readonly compensationRef: string | null;
}

export type RunFiredEvent = DomainEvent<typeof RUN_FIRED, RunEventPayload>;
export type RunApprovedEvent = DomainEvent<typeof RUN_APPROVED, RunEventPayload>;
export type RunRejectedEvent = DomainEvent<typeof RUN_REJECTED, RunEventPayload>;
export type RunExecutionStartedEvent = DomainEvent<typeof RUN_EXECUTION_STARTED, RunEventPayload>;
export type RunSucceededEvent = DomainEvent<typeof RUN_SUCCEEDED, RunEventPayload>;
export type RunFailedEvent = DomainEvent<typeof RUN_FAILED, RunEventPayload>;
export type RunCompensatedEvent = DomainEvent<typeof RUN_COMPENSATED, RunEventPayload>;

// The verdict and its reason codes are snapshotted on the run, so this payload reads them rather than
// recomputing: what the gate said at the moment the rule fired is the fact of record, and re-deriving it later
// against a rule someone has since amended would broadcast a verdict that never happened.
const runPayload = (run: AutomationRun): RunEventPayload => ({
  runId: run.id,
  organizationId: run.organizationId,
  ruleId: run.ruleId,
  ruleKey: run.ruleKey,
  signalKey: run.signalKey,
  subjectDomain: run.subjectDomain,
  subjectId: run.subjectId,
  recommendationId: run.recommendationId,
  autonomyMode: run.autonomyMode,
  disposition: run.disposition,
  reasons: run.reasons,
  status: run.status,
  actionKind: run.action.kind,
  actionTargetKey: run.action.targetKey,
  actionRiskLevel: run.action.riskLevel,
  actionReversibility: run.action.reversibility,
  observedFactCount: run.observedFacts.length,
  compensationState: run.compensationState,
  executionRef: run.executionRef,
  compensationRef: run.compensationRef,
});

/**
 * A standing rule matched a signal and reached a verdict by itself. Fired for every verdict, including the
 * blocked ones — a rule that was stopped is as much a fact about an institution's night as one that ran.
 */
export const automationRunFired = (r: AutomationRun): RunFiredEvent =>
  createEvent(RUN_FIRED, runPayload(r), { tenantId: r.tenantId });
export const automationRunApproved = (r: AutomationRun): RunApprovedEvent =>
  createEvent(RUN_APPROVED, runPayload(r), { tenantId: r.tenantId });
export const automationRunRejected = (r: AutomationRun): RunRejectedEvent =>
  createEvent(RUN_REJECTED, runPayload(r), { tenantId: r.tenantId });
export const automationRunExecutionStarted = (r: AutomationRun): RunExecutionStartedEvent =>
  createEvent(RUN_EXECUTION_STARTED, runPayload(r), { tenantId: r.tenantId });
export const automationRunSucceeded = (r: AutomationRun): RunSucceededEvent =>
  createEvent(RUN_SUCCEEDED, runPayload(r), { tenantId: r.tenantId });
export const automationRunFailed = (r: AutomationRun): RunFailedEvent =>
  createEvent(RUN_FAILED, runPayload(r), { tenantId: r.tenantId });

/** Something an automation did has been put back. The end of the contract's third rule, in public. */
export const automationRunCompensated = (r: AutomationRun): RunCompensatedEvent =>
  createEvent(RUN_COMPENSATED, runPayload(r), { tenantId: r.tenantId });
