import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  type CreateAutomationRuleParams,
  activateRule,
  createAutomationRule,
  declareAction,
  declareCondition,
  pauseRule,
  retireRule,
} from "./automation-rule";
import { approveRun, beginRunExecution, completeRun, fireRule } from "./automation-run";
import type { ActionView } from "./decision-view";
import {
  type DecideOnRecommendationParams,
  type DecisionRecord,
  completeExecution,
  decideOnRecommendation,
  requestExecution,
} from "./decision-record";
import { type Recommendation, citeEvidence, createRecommendation } from "./recommendation";
import {
  type CreateWorkflowParams,
  type WorkflowDefinition,
  type WorkflowStage,
  createWorkflow,
  defineStage,
  publishWorkflow,
  reviseWorkflow,
} from "./workflow";
import {
  type WorkflowInstance,
  cancelWorkflowInstance,
  startWorkflowInstance,
} from "./workflow-instance";
import {
  InMemoryAutomationRuleRepository,
  InMemoryAutomationRunRepository,
  InMemoryDecisionRecordRepository,
  InMemoryRecommendationRepository,
  InMemoryWorkflowInstanceRepository,
  InMemoryWorkflowRepository,
} from "./ports";

const T1 = "tenant-1" as TenantId;
const T2 = "tenant-2" as TenantId;
const ORG = "org-1" as Uuid;

// --- Fixtures --------------------------------------------------------------------

const recommendationIn = (tenantId: TenantId, subjectId = "student-4471"): Recommendation =>
  createRecommendation({
    tenantId,
    organizationId: ORG,
    title: "Contact the guardian about a fifth consecutive absence",
    subjectDomain: "attendance",
    subjectId,
    impactBand: "individual",
    riskLevel: "medium",
    evidence: [citeEvidence({ source: "knowledge_graph", ref: "entity-8812", strength: "strong" })],
  });

/** An action that changed something and declares how to put it back — the only kind that comes due. */
const compensatable = (): ActionView =>
  declareAction({
    kind: "invoke_capability",
    targetKey: "engagement.notify_guardian",
    riskLevel: "low",
    reversibility: "compensatable",
    compensationKey: "engagement.retract_notification",
  });

const decisionOn = (
  recommendation: Recommendation,
  patch: Partial<DecideOnRecommendationParams> = {},
): DecisionRecord =>
  decideOnRecommendation(recommendation, {
    disposition: "approved",
    decidedByUserId: "user-6602",
    action: compensatable(),
    ...patch,
  });

const stage = (patch: Partial<Parameters<typeof defineStage>[0]> = {}): WorkflowStage =>
  defineStage({
    key: "review",
    name: "Pastoral review",
    ordinal: 1,
    kind: "human_task",
    riskLevel: "low",
    reversibility: "reversible",
    ...patch,
  });

const workflowIn = (
  tenantId: TenantId,
  patch: Partial<CreateWorkflowParams> = {},
): WorkflowDefinition =>
  createWorkflow({
    tenantId,
    organizationId: ORG,
    key: "attendance-intervention",
    name: "Attendance intervention",
    trigger: "signal",
    triggerSignalKey: "attendance.streak_extended",
    stages: [stage()],
    ...patch,
  });

const publishedIn = (
  tenantId: TenantId,
  patch: Partial<CreateWorkflowParams> = {},
): WorkflowDefinition => publishWorkflow(workflowIn(tenantId, patch), { publishedByUserId: "u-1" });

const instanceOn = (workflow: WorkflowDefinition, subjectId = "student-4471"): WorkflowInstance =>
  startWorkflowInstance(workflow, {
    subjectDomain: "attendance",
    subjectId,
    triggeredByUserId: "user-1102",
  });

const ruleBase: Omit<CreateAutomationRuleParams, "tenantId"> = {
  organizationId: ORG,
  key: "attendance.chronic_absence_followup",
  name: "Notify a guardian after a fifth consecutive absence",
  signalKey: "attendance.streak_extended",
  conditions: [
    declareCondition({ key: "absence_streak", operator: "greater_than", values: ["4"] }),
  ],
  action: declareAction({
    kind: "invoke_capability",
    targetKey: "engagement.notify_guardian",
    riskLevel: "low",
    reversibility: "reversible",
  }),
  autonomyMode: "auto_execute",
};

const ruleIn = (tenantId: TenantId, patch: Partial<CreateAutomationRuleParams> = {}) =>
  activateRule(createAutomationRule({ ...ruleBase, tenantId, ...patch }), {
    activatedByUserId: "user-1102",
  });

const firingOn = (rule: ReturnType<typeof ruleIn>, subjectId = "student-4471") =>
  fireRule(rule, {
    subjectDomain: "attendance",
    subjectId,
    facts: { absence_streak: 5 },
  });

// --- Tenancy ---------------------------------------------------------------------

/**
 * Tenancy is the invariant every one of these repositories exists to hold. RLS is the barrier that cannot be
 * forgotten, but it lives in the adapter; what is asserted here is that the port itself filters too, so a
 * mis-scoped read is a miss in both layers rather than only in the one nobody reviews.
 */
describe("in-memory ports: tenant isolation", () => {
  it("keeps recommendations inside their tenant, by id and by subject", async () => {
    const repo = new InMemoryRecommendationRepository();
    const mine = recommendationIn(T1);
    await repo.save(mine);
    await repo.save(recommendationIn(T2));

    expect(await repo.findById(T1, mine.id)).toEqual(mine);
    expect(await repo.findById(T2, mine.id)).toBeNull();
    expect(await repo.listBySubject(T1, "attendance", "student-4471")).toEqual([mine]);
    expect(await repo.listBySubject(T2, "attendance", "student-4471")).toHaveLength(1);
    expect(await repo.listByTenant(T1)).toHaveLength(1);
  });

  it("keeps decisions inside their tenant and indexed by the recommendation they answer", async () => {
    const repo = new InMemoryDecisionRecordRepository();
    const recommendation = recommendationIn(T1);
    const mine = decisionOn(recommendation);
    await repo.save(mine);
    await repo.save(decisionOn(recommendationIn(T2)));

    expect(await repo.findById(T1, mine.id)).toEqual(mine);
    expect(await repo.findById(T2, mine.id)).toBeNull();
    expect(await repo.listByRecommendation(T1, recommendation.id)).toEqual([mine]);
    expect(await repo.listByRecommendation(T2, recommendation.id)).toEqual([]);
  });

  it("keeps workflow definitions inside their tenant, by id, key and signal", async () => {
    const repo = new InMemoryWorkflowRepository();
    const mine = publishedIn(T1);
    await repo.save(mine);
    await repo.save(publishedIn(T2));

    expect(await repo.findById(T2, mine.id)).toBeNull();
    expect(await repo.findPublishedByKey(T1, "attendance-intervention")).toEqual(mine);
    expect(await repo.findPublishedByKey(T2, "attendance-intervention")).not.toEqual(mine);
    expect(await repo.listBySignal(T1, "attendance.streak_extended")).toEqual([mine]);
    expect(await repo.listByTenant(T2)).toHaveLength(1);
  });

  it("keeps cases inside their tenant and indexed by workflow and by subject", async () => {
    const repo = new InMemoryWorkflowInstanceRepository();
    const workflow = publishedIn(T1);
    const mine = instanceOn(workflow);
    await repo.save(mine);
    await repo.save(instanceOn(workflow, "student-9930"));
    await repo.save(instanceOn(publishedIn(T2)));

    expect(await repo.findById(T1, mine.id)).toEqual(mine);
    expect(await repo.findById(T2, mine.id)).toBeNull();
    expect(await repo.listByWorkflow(T1, workflow.id)).toHaveLength(2);
    expect(await repo.listByWorkflow(T2, workflow.id)).toEqual([]);
    expect(await repo.listBySubject(T1, "attendance", "student-4471")).toEqual([mine]);
  });

  it("keeps automation rules inside their tenant, by id and by key", async () => {
    const repo = new InMemoryAutomationRuleRepository();
    const mine = ruleIn(T1);
    await repo.save(mine);
    await repo.save(ruleIn(T2));

    expect(await repo.findById(T1, mine.id)).toEqual(mine);
    expect(await repo.findById(T2, mine.id)).toBeNull();
    expect(await repo.findByKey(T1, "attendance.chronic_absence_followup")).toEqual(mine);
    expect(await repo.findByKey(T2, "attendance.chronic_absence_followup")).not.toEqual(mine);
    expect(await repo.findByKey(T1, "fees.reminder")).toBeNull();
  });

  it("keeps firings inside their tenant and indexed by rule and by subject", async () => {
    const repo = new InMemoryAutomationRunRepository();
    const rule = ruleIn(T1);
    const mine = firingOn(rule);
    await repo.save(mine);
    await repo.save(firingOn(rule, "student-9930"));
    await repo.save(firingOn(ruleIn(T2)));

    expect(await repo.findById(T1, mine.id)).toEqual(mine);
    expect(await repo.findById(T2, mine.id)).toBeNull();
    expect(await repo.listByRule(T1, rule.id)).toHaveLength(2);
    expect(await repo.listByRule(T2, rule.id)).toEqual([]);
    expect(await repo.listBySubject(T1, "attendance", "student-4471")).toEqual([mine]);
  });

  it("saves by id, so writing a moved aggregate replaces it rather than duplicating it", async () => {
    const repo = new InMemoryRecommendationRepository();
    const raised = recommendationIn(T1);
    await repo.save(raised);
    await repo.save({ ...raised, status: "accepted" });

    expect(await repo.listByTenant(T1)).toHaveLength(1);
    expect((await repo.findById(T1, raised.id))?.status).toBe("accepted");
  });
});

// --- Version resolution ----------------------------------------------------------

/**
 * A key does not identify a workflow, a key and a version do, and the three lookups exist because three
 * different callers need three different answers about the same key. The case that separates them is the one
 * an institution is in most of the time: a version cases are running under, and a revision being written beside
 * it.
 */
describe("in-memory ports: resolving a workflow version", () => {
  it("separates the version that takes new cases from the one being written", async () => {
    const repo = new InMemoryWorkflowRepository();
    const live = publishedIn(T1);
    const nextDraft = reviseWorkflow(live, { createdByUserId: "user-1102" });
    await repo.save(live);
    await repo.save(nextDraft);

    expect(await repo.findPublishedByKey(T1, "attendance-intervention")).toEqual(live);
    expect(await repo.findLatestByKey(T1, "attendance-intervention")).toEqual(nextDraft);
    expect(await repo.findByKeyAndVersion(T1, "attendance-intervention", 1)).toEqual(live);
    expect(await repo.findByKeyAndVersion(T1, "attendance-intervention", 2)).toEqual(nextDraft);
  });

  it("dispatches a signal only to versions that may take cases", async () => {
    const repo = new InMemoryWorkflowRepository();
    const live = publishedIn(T1);
    await repo.save(live);
    await repo.save(reviseWorkflow(live));
    await repo.save(workflowIn(T1, { key: "fees-escalation" }));

    expect(await repo.listBySignal(T1, "attendance.streak_extended")).toEqual([live]);
    expect(await repo.listBySignal(T1, "fees.overdue")).toEqual([]);
    expect(await repo.listByTenant(T1)).toHaveLength(3);
  });

  it("reports nothing rather than a draft when no version has been published", async () => {
    const repo = new InMemoryWorkflowRepository();
    const draft = workflowIn(T1);
    await repo.save(draft);

    expect(await repo.findPublishedByKey(T1, "attendance-intervention")).toBeNull();
    expect(await repo.findLatestByKey(T1, "attendance-intervention")).toEqual(draft);
    expect(await repo.findLatestByKey(T1, "fees-escalation")).toBeNull();
  });
});

// --- The operational queues ------------------------------------------------------

/**
 * The contract's first and third rules are only real if the two queues they create can actually be read: what a
 * standing rule wants to do and cannot until somebody owns it, and what one already did and still owes back.
 * These are the reads an institution running unattended automation puts on a screen every morning, so each one
 * is asserted to return exactly its own queue and nothing adjacent to it.
 */
describe("in-memory ports: the queues automation creates", () => {
  it("lists only recommendations still waiting on an answer", async () => {
    const repo = new InMemoryRecommendationRepository();
    const open = recommendationIn(T1);
    await repo.save(open);
    await repo.save({ ...recommendationIn(T1, "student-9930"), status: "accepted" });
    await repo.save({ ...recommendationIn(T1, "student-2214"), status: "expired" });

    expect(await repo.listOpen(T1)).toEqual([open]);
    expect(await repo.listByTenant(T1)).toHaveLength(3);
  });

  it("lists every decision taken on one recommendation, deferrals included", async () => {
    const repo = new InMemoryDecisionRecordRepository();
    const recommendation = recommendationIn(T1);
    await repo.save(decisionOn(recommendation, { disposition: "deferred", action: null }));
    await repo.save(decisionOn(recommendation, { disposition: "deferred", action: null }));
    await repo.save(decisionOn(recommendation));

    const trail = await repo.listByRecommendation(T1, recommendation.id);
    expect(trail).toHaveLength(3);
    expect(trail.filter((decision) => decision.disposition === "deferred")).toHaveLength(2);
  });

  it("lists only decisions whose act is carried out and not yet put back", async () => {
    const repo = new InMemoryDecisionRecordRepository();
    const due = completeExecution(
      requestExecution(decisionOn(recommendationIn(T1)), "invocation-7741"),
    );
    await repo.save(due);
    await repo.save(decisionOn(recommendationIn(T1), { disposition: "deferred", action: null }));

    expect(await repo.listCompensationDue(T1)).toEqual([due]);
    expect(await repo.listCompensationDue(T2)).toEqual([]);
  });

  it("lists only cases that are still open", async () => {
    const repo = new InMemoryWorkflowInstanceRepository();
    const workflow = publishedIn(T1);
    const running = instanceOn(workflow);
    await repo.save(running);
    await repo.save(
      cancelWorkflowInstance(instanceOn(workflow, "student-9930"), {
        cancelledByUserId: "user-3390",
      }),
    );

    expect(await repo.listRunning(T1)).toEqual([running]);
    expect(await repo.listByTenant(T1)).toHaveLength(2);
  });

  it("dispatches a signal only to rules that are actually on", async () => {
    const repo = new InMemoryAutomationRuleRepository();
    const live = ruleIn(T1);
    await repo.save(live);
    await repo.save(pauseRule(ruleIn(T1, { key: "attendance.paused_followup" })));
    await repo.save(retireRule(ruleIn(T1, { key: "attendance.retired_followup" })));
    await repo.save(createAutomationRule({ ...ruleBase, tenantId: T1, key: "attendance.draft" }));

    expect(await repo.listBySignal(T1, "attendance.streak_extended")).toEqual([live]);
    expect(await repo.listByTenant(T1)).toHaveLength(4);
  });

  it("lists only firings a person has still to own", async () => {
    const repo = new InMemoryAutomationRunRepository();
    const referred = firingOn(ruleIn(T1, { autonomyMode: "auto_with_approval" }));
    await repo.save(referred);
    await repo.save(firingOn(ruleIn(T1)));

    expect(referred.status).toBe("awaiting_approval");
    expect(await repo.listAwaitingApproval(T1)).toEqual([referred]);
    expect(await repo.listAwaitingApproval(T2)).toEqual([]);
  });

  it("moves a firing off the approval queue once somebody owns it", async () => {
    const repo = new InMemoryAutomationRunRepository();
    const referred = firingOn(ruleIn(T1, { autonomyMode: "auto_with_approval" }));
    await repo.save(referred);
    await repo.save(approveRun(referred, { approvedByUserId: "user-8814" }));

    expect(await repo.listAwaitingApproval(T1)).toEqual([]);
    expect(await repo.listByTenant(T1)).toHaveLength(1);
  });

  it("lists only firings that acted and still owe the institution a rollback", async () => {
    const repo = new InMemoryAutomationRunRepository();
    const rule = ruleIn(T1, {
      action: declareAction({
        kind: "invoke_capability",
        targetKey: "engagement.notify_guardian",
        riskLevel: "low",
        reversibility: "compensatable",
        compensationKey: "engagement.retract_notification",
      }),
    });
    const due = completeRun(beginRunExecution(firingOn(rule), "invocation-5540"));
    await repo.save(due);
    await repo.save(firingOn(ruleIn(T1)));

    expect(due.compensationState).toBe("available");
    expect(await repo.listCompensationDue(T1)).toEqual([due]);
    expect(await repo.listCompensationDue(T2)).toEqual([]);
  });
});

// --- What has no delete path -----------------------------------------------------

/**
 * Four of the six repositories have no `remove`, and that is a design position rather than an omission. A
 * recommendation is the record of what was proposed, a decision of what was chosen, a case of what was done
 * stage by stage, and a run of what the platform did while nobody was watching. None of the four is a draft, so
 * none of the four is discardable — and a delete path that does not exist cannot be reached by mistake.
 */
describe("in-memory ports: what cannot be deleted", () => {
  it("offers no way to delete a recommendation, a decision, a case or a firing", () => {
    expect("remove" in new InMemoryRecommendationRepository()).toBe(false);
    expect("remove" in new InMemoryDecisionRecordRepository()).toBe(false);
    expect("remove" in new InMemoryWorkflowInstanceRepository()).toBe(false);
    expect("remove" in new InMemoryAutomationRunRepository()).toBe(false);
  });

  it("offers one for the definitions an institution maintains", () => {
    expect(typeof new InMemoryWorkflowRepository().remove).toBe("function");
    expect(typeof new InMemoryAutomationRuleRepository().remove).toBe("function");
  });

  it("refuses to remove another tenant's workflow version or rule", async () => {
    const workflows = new InMemoryWorkflowRepository();
    const rules = new InMemoryAutomationRuleRepository();
    const workflow = workflowIn(T1);
    const rule = ruleIn(T1);
    await workflows.save(workflow);
    await rules.save(rule);

    await workflows.remove(T2, workflow.id);
    await rules.remove(T2, rule.id);
    expect(await workflows.findById(T1, workflow.id)).toEqual(workflow);
    expect(await rules.findById(T1, rule.id)).toEqual(rule);

    await workflows.remove(T1, workflow.id);
    await rules.remove(T1, rule.id);
    expect(await workflows.findById(T1, workflow.id)).toBeNull();
    expect(await rules.findById(T1, rule.id)).toBeNull();
  });
});
