import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  RECOMMENDATION_EXPIRED,
  RECOMMENDATION_RAISED,
  RECOMMENDATION_SUPERSEDED,
  RULE_ACTIVATED,
  RULE_DRAFTED,
  RUN_FIRED,
  automationRunApproved,
  automationRunCompensated,
  automationRunExecutionStarted,
  automationRunFailed,
  automationRunFired,
  automationRunRejected,
  automationRunSucceeded,
  decisionCompensated,
  decisionExecutionCompleted,
  decisionExecutionFailed,
  decisionExecutionRequested,
  decisionRecorded,
  instanceCancelled,
  instanceCompleted,
  instanceFailed,
  instanceStageBegun,
  instanceStageCompensated,
  instanceStageCompleted,
  instanceStageFailed,
  instanceStageSkipped,
  instanceStarted,
  recommendationAccepted,
  recommendationEvidenceAdded,
  recommendationEvidenceRetracted,
  recommendationExpired,
  recommendationRaised,
  recommendationRejected,
  recommendationSuperseded,
  recommendationWithdrawn,
  ruleActivated,
  ruleAmended,
  ruleDrafted,
  rulePaused,
  ruleRetired,
  workflowAmended,
  workflowDrafted,
  workflowPublished,
  workflowResumed,
  workflowRetired,
  workflowRevised,
  workflowSuspended,
} from "./decision-events";
import {
  activateRule,
  amendAutomationRule,
  classifyRuleAction,
  createAutomationRule,
  declareAction,
  declareCondition,
  pauseRule,
  retireRule,
} from "./automation-rule";
import {
  approveRun,
  beginRunExecution,
  compensateRun,
  completeRun,
  failRun,
  fireRule,
  rejectRun,
} from "./automation-run";
import {
  compensateDecision,
  completeExecution,
  decideOnRecommendation,
  failExecution,
  requestExecution,
} from "./decision-record";
import {
  acceptRecommendation,
  addEvidence,
  citeEvidence,
  createRecommendation,
  expireRecommendation,
  rejectRecommendation,
  retractEvidence,
  supersedeRecommendation,
  withdrawRecommendation,
} from "./recommendation";
import {
  amendWorkflow,
  createWorkflow,
  defineStage,
  publishWorkflow,
  resumeWorkflow,
  retireWorkflow,
  reviseWorkflow,
  suspendWorkflow,
} from "./workflow";
import {
  beginStage,
  cancelWorkflowInstance,
  compensateStage,
  completeStage,
  failStage,
  instanceStageRun,
  skipStage,
  startWorkflowInstance,
} from "./workflow-instance";

const TENANT = "tenant-1" as TenantId;
const ORG = "org-1" as Uuid;

/**
 * Every piece of free text and every person this domain holds, gathered in one place. Each string below is
 * written into an aggregate and must never reappear in an event payload — that is the whole of the last block.
 */
const TITLE = "Chronic absence is developing in 7B";
const SUMMARY = "Four students have crossed a fifth consecutive absence in the same fortnight";
const EVIDENCE_NOTE = "Cross-checked against the register and the guardian contact log";
const DECISION_NOTE = "Agreed with the head of year before any guardian was contacted";
const RESOLUTION_NOTE = "The form tutor had already spoken to the family this week";
const STAGE_NOTE = "Left a voicemail on the mobile number on the contact record";
const CANCELLATION_REASON = "The family withdrew the student before the review fell due";
const APPROVAL_NOTE = "Fine to send, the tutor is aware and has no objection";
const REJECTION_REASON = "This family is already in a safeguarding conversation";
const EXECUTION_ERROR = "guardian.notify returned 502 from the messaging gateway";
const STAGE_ERROR = "The contact record carries no reachable guardian number";
const WORKFLOW_NAME = "Chronic absence follow-up";
const WORKFLOW_DESCRIPTION = "Contact the guardian, then escalate to the head of year";
const RULE_NAME = "Notify a guardian after a fifth consecutive absence";
const RULE_DESCRIPTION = "Standing rule for the attendance team, reviewed each term";
const FACT_READING = "unreachable";
const PROPOSER = "user-2201";
const RESOLVER = "user-5518";
const DECIDER = "user-6602";
const PUBLISHER = "user-7714";
const APPROVER = "user-8814";
const REJECTOR = "user-9905";
const CANCELLER = "user-3390";
const ASSIGNEE = "user-4417";
const AUTHOR = "user-1102";

const FREE_TEXT = [
  TITLE,
  SUMMARY,
  EVIDENCE_NOTE,
  DECISION_NOTE,
  RESOLUTION_NOTE,
  STAGE_NOTE,
  CANCELLATION_REASON,
  APPROVAL_NOTE,
  REJECTION_REASON,
  EXECUTION_ERROR,
  STAGE_ERROR,
  WORKFLOW_NAME,
  WORKFLOW_DESCRIPTION,
  RULE_NAME,
  RULE_DESCRIPTION,
  FACT_READING,
];

const PEOPLE = [
  PROPOSER,
  RESOLVER,
  DECIDER,
  PUBLISHER,
  APPROVER,
  REJECTOR,
  CANCELLER,
  ASSIGNEE,
  AUTHOR,
];

// --- Recommendation fixtures -----------------------------------------------------

const rootEvidence = citeEvidence({
  source: "knowledge_graph",
  ref: "entity-8812",
  strength: "strong",
  note: EVIDENCE_NOTE,
});

const recommendation = createRecommendation({
  tenantId: TENANT,
  organizationId: ORG,
  title: TITLE,
  summary: SUMMARY,
  subjectDomain: "attendance",
  subjectId: "student-4471",
  impactBand: "individual",
  riskLevel: "medium",
  evidence: [rootEvidence],
  proposedByUserId: PROPOSER,
});

const resolution = { resolvedByUserId: RESOLVER, note: RESOLUTION_NOTE };

/**
 * The same proposal, low enough in risk that the gate would let it run with nobody present. It exists only so
 * the autonomous-decision case can be constructed at all — the ceiling for unattended execution is `low`, and
 * the fixture above is deliberately above it.
 */
const unattendable = createRecommendation({
  tenantId: TENANT,
  organizationId: ORG,
  title: TITLE,
  subjectDomain: "attendance",
  subjectId: "student-4471",
  impactBand: "individual",
  riskLevel: "low",
  evidence: [rootEvidence],
});

// --- Decision fixtures -----------------------------------------------------------

const action = declareAction({
  kind: "invoke_capability",
  targetKey: "engagement.notify_guardian",
  riskLevel: "low",
  reversibility: "compensatable",
  compensationKey: "engagement.retract_notification",
});

const decision = decideOnRecommendation(recommendation, {
  disposition: "approved",
  decidedByUserId: DECIDER,
  note: DECISION_NOTE,
  autonomyReasons: ["mode_forbids_auto_execution"],
  action,
});

const judgement = decideOnRecommendation(recommendation, {
  disposition: "deferred",
  decidedByUserId: DECIDER,
  note: DECISION_NOTE,
});

const requested = requestExecution(decision, "invocation-7741");

// --- Workflow fixtures -----------------------------------------------------------

const stages = [
  defineStage({
    key: "contact_guardian",
    name: "Contact the guardian",
    ordinal: 1,
    kind: "automated_action",
    capabilityKey: "engagement.notify_guardian",
    riskLevel: "low",
    reversibility: "compensatable",
    compensationKey: "engagement.retract_notification",
  }),
  defineStage({
    key: "escalate",
    name: "Escalate to the head of year",
    ordinal: 2,
    kind: "human_task",
    riskLevel: "low",
    reversibility: "reversible",
    dependsOn: ["contact_guardian"],
    assigneeRole: "head-of-year",
    slaHours: 48,
  }),
];

const draftWorkflow = createWorkflow({
  tenantId: TENANT,
  organizationId: ORG,
  key: "attendance.chronic_absence_followup",
  name: WORKFLOW_NAME,
  description: WORKFLOW_DESCRIPTION,
  trigger: "signal",
  triggerSignalKey: "attendance.streak_extended",
  stages,
  createdByUserId: AUTHOR,
});

const published = publishWorkflow(draftWorkflow, { publishedByUserId: PUBLISHER });

const instance = startWorkflowInstance(published, {
  subjectDomain: "attendance",
  subjectId: "student-4471",
  triggeredByRuleId: "rule-2266",
  recommendationId: recommendation.id,
});

const begun = beginStage(instance, "contact_guardian", { assignedToUserId: ASSIGNEE });
const done = completeStage(begun, "contact_guardian", {
  note: STAGE_NOTE,
  executionRef: "invocation-3120",
});

const stageRun = (i: typeof instance, key: string) => {
  const run = instanceStageRun(i, key);
  if (run === null) {
    throw new Error(`fixture is wrong: no stage run for ${key}`);
  }
  return run;
};

// --- Automation fixtures ---------------------------------------------------------

const draftRule = createAutomationRule({
  tenantId: TENANT,
  organizationId: ORG,
  key: "attendance.chronic_absence_followup",
  name: RULE_NAME,
  description: RULE_DESCRIPTION,
  signalKey: "attendance.streak_extended",
  conditions: [
    declareCondition({ key: "absence_streak", operator: "greater_than", values: ["4"] }),
    declareCondition({
      key: "guardian_contact_state",
      operator: "equals",
      values: [FACT_READING],
    }),
  ],
  action: declareAction({
    kind: "invoke_capability",
    targetKey: "engagement.notify_guardian",
    riskLevel: "low",
    reversibility: "compensatable",
    compensationKey: "engagement.retract_notification",
  }),
  autonomyMode: "auto_execute",
  createdByUserId: AUTHOR,
});

const liveRule = activateRule(draftRule, { activatedByUserId: PUBLISHER });

const run = fireRule(liveRule, {
  subjectDomain: "attendance",
  subjectId: "student-4471",
  facts: { absence_streak: 5, guardian_contact_state: FACT_READING },
});

const executing = beginRunExecution(run, "invocation-5540");

describe("what a recommendation broadcasts", () => {
  it("names the subject, the bands and the chain — and none of the words", () => {
    const event = recommendationRaised(recommendation);
    expect(event.type).toBe(RECOMMENDATION_RAISED);
    expect(event.metadata.tenantId).toBe(TENANT);
    expect(event.payload).toMatchObject({
      recommendationId: recommendation.id,
      organizationId: ORG,
      subjectDomain: "attendance",
      subjectId: "student-4471",
      impactBand: "individual",
      riskLevel: "medium",
      requiresHumanJudgement: false,
      status: "proposed",
      evidenceCount: 1,
      grounded: true,
      raisedByRuleId: null,
      supersededById: null,
    });
  });

  it("counts a citation as it is added and again as it is taken back", () => {
    const enriched = addEvidence(recommendation, {
      source: "reasoning_session",
      ref: "session-4410",
      strength: "moderate",
      supports: [rootEvidence.id],
    });
    expect(recommendationEvidenceAdded(enriched).payload.evidenceCount).toBe(2);

    const thinned = retractEvidence(enriched, enriched.evidence[1]?.id ?? "");
    expect(recommendationEvidenceRetracted(thinned).payload.evidenceCount).toBe(1);
  });

  it("carries whether the chain still grounds it, on every event and not only the evidence ones", () => {
    expect(
      recommendationAccepted(acceptRecommendation(recommendation, resolution)).payload,
    ).toMatchObject({ status: "accepted", grounded: true, confidence: recommendation.confidence });
  });

  it("says a person disagreed without saying which person or what they wrote", () => {
    const event = recommendationRejected(rejectRecommendation(recommendation, resolution));
    expect(event.payload.status).toBe("rejected");
    expect(JSON.stringify(event.payload)).not.toContain(RESOLVER);
    expect(JSON.stringify(event.payload)).not.toContain(RESOLUTION_NOTE);
  });

  it("names the successor on a supersession, so the trail stays walkable", () => {
    const successor = "11111111-2222-3333-4444-555555555555" as Uuid;
    const event = recommendationSuperseded(supersedeRecommendation(recommendation, successor));
    expect(event.type).toBe(RECOMMENDATION_SUPERSEDED);
    expect(event.payload.supersededById).toBe(successor);
  });

  it("reports an expiry as its own outcome, with nobody behind it", () => {
    const event = recommendationExpired(expireRecommendation(recommendation));
    expect(event.type).toBe(RECOMMENDATION_EXPIRED);
    expect(event.payload.status).toBe("expired");
    expect(JSON.stringify(event.payload)).not.toContain("user-");
  });

  it("names the rule that raised it, because a rule is not a person", () => {
    const machineRaised = createRecommendation({
      tenantId: TENANT,
      organizationId: ORG,
      title: TITLE,
      subjectDomain: "attendance",
      subjectId: "student-4471",
      impactBand: "individual",
      riskLevel: "medium",
      evidence: [rootEvidence],
      raisedByRuleId: "rule-2266",
    });
    expect(recommendationRaised(machineRaised).payload.raisedByRuleId).toBe("rule-2266");
  });
});

describe("what a decision broadcasts", () => {
  it("carries the bands as they stood, the reason codes and what was authorized", () => {
    expect(decisionRecorded(decision).payload).toMatchObject({
      decisionId: decision.id,
      recommendationId: recommendation.id,
      disposition: "approved",
      autonomous: false,
      confidenceAtDecision: recommendation.confidence,
      riskLevelAtDecision: "medium",
      impactBandAtDecision: "individual",
      evidenceCount: 1,
      autonomyReasons: ["mode_forbids_auto_execution"],
      actionKind: "invoke_capability",
      actionTargetKey: "engagement.notify_guardian",
      actionReversibility: "compensatable",
      executionOutcome: "not_started",
    });
  });

  it("flags an autonomous decision rather than leaving it to be inferred from a missing person", () => {
    const machine = decideOnRecommendation(unattendable, {
      disposition: "auto_executed",
      autonomyReasons: [],
      action,
    });
    expect(decisionRecorded(machine).payload.autonomous).toBe(true);
    expect(decisionRecorded(decision).payload.autonomous).toBe(false);
  });

  it("leaves the action fields null when the decision authorized nothing", () => {
    expect(decisionRecorded(judgement).payload).toMatchObject({
      disposition: "deferred",
      actionKind: null,
      actionTargetKey: null,
      actionReversibility: null,
    });
  });

  it("names the runtime reference the act was carried out as", () => {
    expect(decisionExecutionRequested(requested).payload).toMatchObject({
      executionOutcome: "requested",
      executionRef: "invocation-7741",
      compensationState: "available",
    });
    expect(decisionExecutionCompleted(completeExecution(requested)).payload.executionOutcome).toBe(
      "succeeded",
    );
  });

  it("reports a failure without reporting the failure message", () => {
    const event = decisionExecutionFailed(failExecution(requested, EXECUTION_ERROR));
    expect(event.payload.executionOutcome).toBe("failed");
    expect(JSON.stringify(event.payload)).not.toContain(EXECUTION_ERROR);
  });

  it("says what was put back and what put it back", () => {
    const event = decisionCompensated(compensateDecision(requested, "invocation-7742"));
    expect(event.payload).toMatchObject({
      executionOutcome: "compensated",
      compensationState: "compensated",
      compensationRef: "invocation-7742",
    });
  });
});

describe("what a workflow broadcasts", () => {
  it("identifies the process by key and version, and counts what it would do unattended", () => {
    expect(workflowDrafted(draftWorkflow).payload).toMatchObject({
      workflowId: draftWorkflow.id,
      key: "attendance.chronic_absence_followup",
      version: 1,
      trigger: "signal",
      triggerSignalKey: "attendance.streak_extended",
      status: "draft",
      stageCount: 2,
      automatedStageCount: 1,
    });
  });

  it("moves through its lifecycle carrying the same identity each time", () => {
    expect(workflowPublished(published).payload.status).toBe("published");
    expect(workflowSuspended(suspendWorkflow(published)).payload.status).toBe("suspended");
    expect(workflowResumed(resumeWorkflow(suspendWorkflow(published))).payload.status).toBe(
      "published",
    );
    expect(workflowRetired(retireWorkflow(published)).payload.status).toBe("retired");
  });

  it("reports an amendment without reporting what the words were changed to", () => {
    const amended = amendWorkflow(draftWorkflow, { name: "Absence follow-up, revised" });
    const event = workflowAmended(amended);
    expect(event.payload.workflowId).toBe(draftWorkflow.id);
    expect(JSON.stringify(event.payload)).not.toContain("revised");
  });

  it("carries the new draft on a revision, not the published version it came from", () => {
    const event = workflowRevised(reviseWorkflow(published));
    expect(event.payload).toMatchObject({ version: 2, status: "draft" });
    expect(event.payload.workflowId).not.toBe(published.id);
  });
});

describe("what a case broadcasts", () => {
  it("names the process version it is running under and where the subject sits", () => {
    expect(instanceStarted(instance).payload).toMatchObject({
      instanceId: instance.id,
      workflowId: published.id,
      workflowKey: "attendance.chronic_absence_followup",
      workflowVersion: 1,
      subjectDomain: "attendance",
      subjectId: "student-4471",
      trigger: "signal",
      triggeredByRuleId: "rule-2266",
      recommendationId: recommendation.id,
      status: "running",
      stageCount: 2,
      completedStageCount: 0,
      outstandingStageCount: 2,
      failureStageKey: null,
    });
  });

  it("reports progress as counts, so a subscriber can ask what is still outstanding", () => {
    expect(instanceStageCompleted(done, stageRun(done, "contact_guardian")).payload).toMatchObject({
      completedStageCount: 1,
      outstandingStageCount: 1,
    });
  });

  it("adds the stage to the case it belongs to, never replacing it", () => {
    const event = instanceStageBegun(begun, stageRun(begun, "contact_guardian"));
    expect(event.payload).toMatchObject({
      instanceId: instance.id,
      stageKey: "contact_guardian",
      stageKind: "automated_action",
      stageStatus: "active",
      stageExecutionRef: null,
    });
  });

  it("carries the runtime reference a completed automated stage requested", () => {
    const event = instanceStageCompleted(done, stageRun(done, "contact_guardian"));
    expect(event.payload.stageExecutionRef).toBe("invocation-3120");
    expect(JSON.stringify(event.payload)).not.toContain(STAGE_NOTE);
  });

  it("says a stage was skipped without saying why anyone skipped it", () => {
    const optional = startWorkflowInstance(
      publishWorkflow(
        createWorkflow({
          tenantId: TENANT,
          organizationId: ORG,
          key: "attendance.optional_check",
          name: WORKFLOW_NAME,
          trigger: "manual",
          stages: [
            defineStage({
              key: "courtesy_call",
              name: "Courtesy call",
              ordinal: 1,
              kind: "human_task",
              riskLevel: "low",
              reversibility: "reversible",
              optional: true,
            }),
          ],
        }),
      ),
      { subjectDomain: "attendance", subjectId: "student-4471", triggeredByUserId: AUTHOR },
    );
    const skipped = skipStage(optional, "courtesy_call", { note: STAGE_NOTE });
    const event = instanceStageSkipped(skipped, stageRun(skipped, "courtesy_call"));
    expect(event.payload.stageStatus).toBe("skipped");
    expect(JSON.stringify(event.payload)).not.toContain(STAGE_NOTE);
  });

  it("names the stage a case stopped at, and not the error that stopped it", () => {
    const broken = failStage(begun, "contact_guardian", { error: STAGE_ERROR });
    const stage = instanceStageFailed(broken, stageRun(broken, "contact_guardian"));
    expect(stage.payload.stageStatus).toBe("failed");
    expect(JSON.stringify(stage.payload)).not.toContain(STAGE_ERROR);

    const settled = instanceFailed(broken);
    expect(settled.payload).toMatchObject({
      status: "failed",
      failureStageKey: "contact_guardian",
    });
    expect(JSON.stringify(settled.payload)).not.toContain(STAGE_ERROR);
  });

  it("reports a compensated stage and a cancelled case without the people or the reasons", () => {
    const putBack = compensateStage(done, "contact_guardian");
    expect(
      instanceStageCompensated(putBack, stageRun(putBack, "contact_guardian")).payload.stageStatus,
    ).toBe("compensated");

    const stopped = cancelWorkflowInstance(instance, {
      cancelledByUserId: CANCELLER,
      reason: CANCELLATION_REASON,
    });
    const event = instanceCancelled(stopped);
    expect(event.payload.status).toBe("cancelled");
    expect(JSON.stringify(event.payload)).not.toContain(CANCELLER);
    expect(JSON.stringify(event.payload)).not.toContain(CANCELLATION_REASON);
  });

  it("reports a completed case by its counts", () => {
    const finished = completeStage(beginStage(done, "escalate"), "escalate");
    expect(instanceCompleted(finished).payload).toMatchObject({
      status: "completed",
      completedStageCount: 2,
      outstandingStageCount: 0,
    });
  });
});

describe("what an automation rule broadcasts", () => {
  it("carries the autonomy gate's verdict on a draft that could never pass it", () => {
    const event = ruleDrafted(draftRule);
    expect(event.type).toBe(RULE_DRAFTED);
    expect(event.payload).toMatchObject({
      ruleId: draftRule.id,
      key: "attendance.chronic_absence_followup",
      signalKey: "attendance.streak_extended",
      status: "draft",
      autonomyMode: "auto_execute",
      conditionCount: 2,
      actionKind: "invoke_capability",
      actionTargetKey: "engagement.notify_guardian",
      actionRiskLevel: "low",
      actionReversibility: "compensatable",
      compensationDeclared: true,
      disposition: "blocked",
      reasons: ["rule_not_active"],
    });
  });

  it("says the rule may now act unattended, with no reason standing against it", () => {
    const event = ruleActivated(liveRule);
    expect(event.type).toBe(RULE_ACTIVATED);
    expect(event.payload).toMatchObject({
      status: "active",
      disposition: "auto_execute",
      reasons: [],
    });
  });

  it("counts the conditions without broadcasting what they read for", () => {
    expect(JSON.stringify(ruleDrafted(draftRule).payload)).not.toContain(FACT_READING);
    expect(ruleDrafted(draftRule).payload.conditionCount).toBe(2);
  });

  it("re-reports the verdict as the rule's standing changes", () => {
    const paused = pauseRule(liveRule);
    expect(rulePaused(paused).payload).toMatchObject({
      status: "paused",
      disposition: "blocked",
      reasons: ["rule_not_active"],
    });
    expect(ruleRetired(retireRule(liveRule)).payload.status).toBe("retired");
  });

  it("reports an amendment by its shape, never by its name or description", () => {
    const amended = amendAutomationRule(draftRule, { name: "Notify sooner", description: null });
    const event = ruleAmended(amended);
    expect(event.payload.ruleId).toBe(draftRule.id);
    expect(JSON.stringify(event.payload)).not.toContain("Notify sooner");
  });
});

describe("what a firing broadcasts", () => {
  it("names the rule, the signal and the subject, and the verdict it reached alone", () => {
    const event = automationRunFired(run);
    expect(event.type).toBe(RUN_FIRED);
    expect(event.payload).toMatchObject({
      runId: run.id,
      ruleId: liveRule.id,
      ruleKey: "attendance.chronic_absence_followup",
      signalKey: "attendance.streak_extended",
      subjectDomain: "attendance",
      subjectId: "student-4471",
      recommendationId: null,
      autonomyMode: "auto_execute",
      disposition: "auto_execute",
      reasons: [],
      status: "gated",
      actionKind: "invoke_capability",
      actionRiskLevel: "low",
      compensationState: "not_required",
    });
  });

  it("counts what was looked at without broadcasting a single reading", () => {
    const event = automationRunFired(run);
    expect(event.payload.observedFactCount).toBe(2);
    expect(JSON.stringify(event.payload)).not.toContain(FACT_READING);
  });

  it("reports the verdict the firing recorded, not one recomputed against the rule since", () => {
    const paused = pauseRule(liveRule);
    expect(classifyRuleAction(paused).disposition).toBe("blocked");
    expect(automationRunFired(run).payload.disposition).toBe("auto_execute");
  });

  it("says a person let it through, or stopped it, without saying who", () => {
    const gated = fireRule(
      activateRule(
        createAutomationRule({
          tenantId: TENANT,
          organizationId: ORG,
          key: "attendance.escalate_absence",
          name: RULE_NAME,
          signalKey: "attendance.streak_extended",
          action: declareAction({
            kind: "invoke_capability",
            targetKey: "engagement.notify_guardian",
            riskLevel: "high",
            reversibility: "reversible",
          }),
          autonomyMode: "auto_execute",
        }),
      ),
      { subjectDomain: "attendance", subjectId: "student-4471" },
    );
    expect(automationRunFired(gated).payload).toMatchObject({
      status: "awaiting_approval",
      disposition: "requires_approval",
      reasons: ["risk_exceeds_auto_execution_ceiling"],
    });

    const allowed = automationRunApproved(
      approveRun(gated, { approvedByUserId: APPROVER, note: APPROVAL_NOTE }),
    );
    expect(allowed.payload.status).toBe("gated");
    expect(JSON.stringify(allowed.payload)).not.toContain(APPROVER);
    expect(JSON.stringify(allowed.payload)).not.toContain(APPROVAL_NOTE);

    const refused = automationRunRejected(
      rejectRun(gated, { rejectedByUserId: REJECTOR, reason: REJECTION_REASON }),
    );
    expect(refused.payload.status).toBe("blocked");
    expect(JSON.stringify(refused.payload)).not.toContain(REJECTOR);
    expect(JSON.stringify(refused.payload)).not.toContain(REJECTION_REASON);
  });

  it("follows the act through to what it owes putting back", () => {
    expect(automationRunExecutionStarted(executing).payload).toMatchObject({
      status: "executing",
      executionRef: "invocation-5540",
      compensationState: "available",
    });
    expect(automationRunSucceeded(completeRun(executing)).payload.status).toBe("succeeded");

    const broken = failRun(executing, EXECUTION_ERROR);
    expect(JSON.stringify(automationRunFailed(broken).payload)).not.toContain(EXECUTION_ERROR);

    const putBack = compensateRun(broken, "invocation-5541");
    expect(automationRunCompensated(putBack).payload).toMatchObject({
      status: "compensated",
      compensationState: "compensated",
      compensationRef: "invocation-5541",
    });
  });
});

describe("what never leaves the domain", () => {
  const everyEvent = (): readonly DomainEvent[] => [
    recommendationRaised(recommendation),
    recommendationEvidenceAdded(recommendation),
    recommendationEvidenceRetracted(recommendation),
    recommendationAccepted(acceptRecommendation(recommendation, resolution)),
    recommendationRejected(rejectRecommendation(recommendation, resolution)),
    recommendationSuperseded(supersedeRecommendation(recommendation, ORG)),
    recommendationExpired(expireRecommendation(recommendation)),
    recommendationWithdrawn(withdrawRecommendation(recommendation, resolution)),
    decisionRecorded(decision),
    decisionRecorded(judgement),
    decisionExecutionRequested(requested),
    decisionExecutionCompleted(completeExecution(requested)),
    decisionExecutionFailed(failExecution(requested, EXECUTION_ERROR)),
    decisionCompensated(compensateDecision(requested, "invocation-7742")),
    workflowDrafted(draftWorkflow),
    workflowAmended(draftWorkflow),
    workflowPublished(published),
    workflowSuspended(suspendWorkflow(published)),
    workflowResumed(resumeWorkflow(suspendWorkflow(published))),
    workflowRetired(retireWorkflow(published)),
    workflowRevised(reviseWorkflow(published)),
    instanceStarted(instance),
    instanceStageBegun(begun, stageRun(begun, "contact_guardian")),
    instanceStageCompleted(done, stageRun(done, "contact_guardian")),
    instanceStageSkipped(done, stageRun(done, "escalate")),
    instanceStageFailed(
      failStage(begun, "contact_guardian", { error: STAGE_ERROR }),
      stageRun(failStage(begun, "contact_guardian", { error: STAGE_ERROR }), "contact_guardian"),
    ),
    instanceStageCompensated(
      compensateStage(done, "contact_guardian"),
      stageRun(compensateStage(done, "contact_guardian"), "contact_guardian"),
    ),
    instanceCompleted(completeStage(beginStage(done, "escalate"), "escalate")),
    instanceFailed(failStage(begun, "contact_guardian", { error: STAGE_ERROR })),
    instanceCancelled(
      cancelWorkflowInstance(instance, {
        cancelledByUserId: CANCELLER,
        reason: CANCELLATION_REASON,
      }),
    ),
    ruleDrafted(draftRule),
    ruleAmended(draftRule),
    ruleActivated(liveRule),
    rulePaused(pauseRule(liveRule)),
    ruleRetired(retireRule(liveRule)),
    automationRunFired(run),
    automationRunApproved(run),
    automationRunRejected(run),
    automationRunExecutionStarted(executing),
    automationRunSucceeded(completeRun(executing)),
    automationRunFailed(failRun(executing, EXECUTION_ERROR)),
    automationRunCompensated(compensateRun(failRun(executing, EXECUTION_ERROR), "invocation-5541")),
  ];

  it("puts no free text on the wire, on any event this module can produce", () => {
    const wire = JSON.stringify(everyEvent().map((event) => event.payload));
    for (const text of FREE_TEXT) {
      expect(wire).not.toContain(text);
    }
  });

  it("puts no person on the wire, on any event this module can produce", () => {
    const wire = JSON.stringify(everyEvent().map((event) => event.payload));
    for (const person of PEOPLE) {
      expect(wire).not.toContain(person);
    }
  });

  it("scopes every event to the tenant it happened in", () => {
    for (const event of everyEvent()) {
      expect(event.metadata.tenantId).toBe(TENANT);
    }
  });

  it("names every event under the decision namespace", () => {
    for (const event of everyEvent()) {
      expect(event.type).toMatch(/^decision\.[a-z_]+\.[a-z_]+$/);
    }
  });

  it("mints a distinct event id for every broadcast", () => {
    const events = everyEvent();
    const ids = new Set(events.map((event) => event.metadata.eventId));
    expect(ids.size).toBe(events.length);
  });
});
