import { beforeEach, describe, expect, it } from "vitest";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { activateRule, createAutomationRule, declareAction } from "./automation-rule";
import {
  approveRun,
  beginRunExecution,
  compensateRun,
  completeRun,
  failRun,
  fireRule,
} from "./automation-run";
import { DecisionOperationsService } from "./decision-operations-service";
import { decideOnRecommendation, failExecution, requestExecution } from "./decision-record";
import {
  InMemoryAutomationRuleRepository,
  InMemoryAutomationRunRepository,
  InMemoryDecisionRecordRepository,
  InMemoryRecommendationRepository,
  InMemoryWorkflowInstanceRepository,
  InMemoryWorkflowRepository,
} from "./ports";
import {
  type CreateRecommendationParams,
  type Recommendation,
  acceptRecommendation,
  citeEvidence,
  createRecommendation,
  rejectRecommendation,
  toRecommendationGateView,
} from "./recommendation";
import { createWorkflow, defineStage, publishWorkflow } from "./workflow";
import { cancelWorkflowInstance, startWorkflowInstance } from "./workflow-instance";

const TENANT = "tenant-1" as TenantId;
const OTHER = "tenant-2" as TenantId;
const ORG = "org-1" as Uuid;

const NOTIFY = "attendance.notify-guardian";
const RETRACT = "attendance.retract-notice";
const SIGNAL = "attendance.fifth-consecutive-absence";

const ASOF = "2026-06-01T00:00:00.000Z" as ISODateString;
const LAPSED_AT = "2026-01-01T00:00:00.000Z" as ISODateString;

const SUBJECT = { subjectDomain: "attendance", subjectId: "student-4471" };

/** Low risk with a declared way back — the only shape a rule is ever allowed to carry out on its own. */
const ACTION = declareAction({
  kind: "invoke_capability",
  targetKey: NOTIFY,
  riskLevel: "low",
  reversibility: "compensatable",
  compensationKey: RETRACT,
});

/** A count roll-up as a plain object, so an assertion reads as the shape rather than as an array of pairs. */
const tally = (counts: readonly { key: string; count: number }[]): Record<string, number> =>
  Object.fromEntries(counts.map((entry) => [entry.key, entry.count]));

describe("DecisionOperationsService", () => {
  let recommendations: InMemoryRecommendationRepository;
  let decisions: InMemoryDecisionRecordRepository;
  let workflows: InMemoryWorkflowRepository;
  let instances: InMemoryWorkflowInstanceRepository;
  let rules: InMemoryAutomationRuleRepository;
  let runs: InMemoryAutomationRunRepository;
  let svc: DecisionOperationsService;

  beforeEach(() => {
    recommendations = new InMemoryRecommendationRepository();
    decisions = new InMemoryDecisionRecordRepository();
    workflows = new InMemoryWorkflowRepository();
    instances = new InMemoryWorkflowInstanceRepository();
    rules = new InMemoryAutomationRuleRepository();
    runs = new InMemoryAutomationRunRepository();
    svc = new DecisionOperationsService({
      recommendations,
      decisions,
      workflows,
      instances,
      rules,
      runs,
    });
  });

  const ask = async (patch: Partial<CreateRecommendationParams> = {}): Promise<Recommendation> => {
    const recommendation = createRecommendation({
      tenantId: TENANT,
      organizationId: ORG,
      title: "Notify the guardian of a fifth consecutive absence",
      subjectDomain: "attendance",
      subjectId: "student-4471",
      impactBand: "individual",
      riskLevel: "low",
      evidence: [
        citeEvidence({ source: "knowledge_graph", ref: "entity-8812", strength: "strong" }),
      ],
      ...patch,
    });
    await recommendations.save(recommendation);
    return recommendation;
  };

  const arm = async (key: string, autonomyMode: "auto_execute" | "auto_with_approval") => {
    const rule = activateRule(
      createAutomationRule({
        tenantId: TENANT,
        organizationId: ORG,
        key,
        name: "Notify the guardian on a fifth consecutive absence",
        signalKey: SIGNAL,
        action: ACTION,
        autonomyMode,
      }),
      { activatedByUserId: "user-6602" },
    );
    await rules.save(rule);
    return rule;
  };

  /**
   * One tenant's whole decision estate: five recommendations in four states, one decision the machine took and
   * one a person took and the runtime then failed, two definitions with two cases, and four firings covering
   * every verdict the autonomy gate can reach.
   */
  const seed = async () => {
    const openLow = await ask();
    const openHigh = await ask({
      subjectId: "student-9930",
      impactBand: "institution",
      riskLevel: "high",
    });
    const lapsed = await ask({
      subjectId: "student-2214",
      impactBand: "cohort",
      expiresAt: LAPSED_AT,
    });
    const answeredYes = await ask({ subjectId: "student-3315" });
    const answeredNo = await ask({ subjectId: "student-7781" });
    await recommendations.save(
      acceptRecommendation(answeredYes, { resolvedByUserId: "user-6602" }),
    );
    await recommendations.save(rejectRecommendation(answeredNo, { resolvedByUserId: "user-6602" }));

    await decisions.save(
      decideOnRecommendation(openLow, { disposition: "auto_executed", action: ACTION }),
    );
    const byHand = decideOnRecommendation(openHigh, {
      disposition: "approved",
      decidedByUserId: "user-6602",
      action: ACTION,
    });
    await decisions.save(failExecution(requestExecution(byHand, "invocation-1"), "timed out"));

    const published = publishWorkflow(
      createWorkflow({
        tenantId: TENANT,
        organizationId: ORG,
        key: "guardian-escalation",
        name: "Guardian escalation",
        trigger: "manual",
        stages: [
          defineStage({
            key: "review",
            name: "Pastoral review",
            ordinal: 1,
            kind: "human_task",
            riskLevel: "low",
            reversibility: "reversible",
            assigneeRole: "class-teacher",
          }),
        ],
      }),
      { publishedByUserId: "user-6602" },
    );
    await workflows.save(published);
    await workflows.save(
      createWorkflow({
        tenantId: TENANT,
        organizationId: ORG,
        key: "transport-review",
        name: "Transport review",
        trigger: "manual",
      }),
    );

    await instances.save(
      startWorkflowInstance(published, { ...SUBJECT, triggeredByUserId: "user-6602" }),
    );
    await instances.save(
      cancelWorkflowInstance(
        startWorkflowInstance(published, {
          ...SUBJECT,
          subjectId: "student-9930",
          triggeredByUserId: "user-6602",
        }),
        { cancelledByUserId: "user-6602", reason: "Guardian already contacted" },
      ),
    );

    const alone = await arm("notify-on-fifth-absence", "auto_execute");
    const referring = await arm("escalate-senior-absence", "auto_with_approval");

    const autonomous = fireRule(alone, SUBJECT);
    await runs.save(
      compensateRun(completeRun(beginRunExecution(autonomous, "invocation-2")), "reversal-1"),
    );

    const approved = approveRun(fireRule(referring, SUBJECT), { approvedByUserId: "user-9" });
    await runs.save(failRun(beginRunExecution(approved, "invocation-3"), "timed out"));

    await runs.save(fireRule(referring, { ...SUBJECT, subjectId: "student-9930" }));
    await runs.save(
      fireRule(alone, {
        ...SUBJECT,
        subjectId: "student-3315",
        recommendation: toRecommendationGateView(
          acceptRecommendation(answeredYes, { resolvedByUserId: "user-6602" }),
        ),
      }),
    );

    return { openLow, openHigh, lapsed };
  };

  // --- The whole picture -----------------------------------------------------------

  it("counts what was proposed and what became of it", async () => {
    await seed();

    const summary = await svc.summarize(TENANT);

    expect(summary.recommendationCount).toBe(5);
    expect(summary.openRecommendationCount).toBe(3);
    expect(tally(summary.recommendationsByStatus)).toEqual({
      proposed: 3,
      accepted: 1,
      rejected: 1,
      superseded: 0,
      expired: 0,
      withdrawn: 0,
    });
  });

  /**
   * The three rates the contract's first rule exists to keep answerable. Read together they say whether the
   * automation is earning the trust it is being given or quietly deciding more than anyone intended.
   */
  it("reports how much the machine decided alone and how much stopped for a person", async () => {
    await seed();

    const summary = await svc.summarize(TENANT);

    expect(summary.decisionCount).toBe(2);
    expect(summary.autonomousDecisionCount).toBe(1);
    expect(summary.humanDecisionCount).toBe(1);
    expect(summary.autonomyRate).toBe(50);
    expect(summary.humanGatedRate).toBe(50);
    expect(summary.acceptanceRate).toBe(50);
  });

  it("counts every firing under the verdict the gate reached", async () => {
    await seed();

    const summary = await svc.summarize(TENANT);

    expect(summary.runCount).toBe(4);
    expect(tally(summary.runsByDisposition)).toEqual({
      auto_execute: 1,
      requires_approval: 2,
      blocked: 1,
    });
    expect(summary.blockedRunCount).toBe(1);
    expect(summary.compensatedRunCount).toBe(1);
    expect(summary.ruleCount).toBe(2);
  });

  it("counts the processes and the cases still moving through them", async () => {
    await seed();

    const summary = await svc.summarize(TENANT);

    expect(summary.workflowCount).toBe(2);
    expect(summary.instanceCount).toBe(2);
    expect(summary.runningInstanceCount).toBe(1);
  });

  /**
   * Every roll-up keeps its whole vocabulary even when nothing has happened, so a chart axis or an export column
   * does not appear and disappear between refreshes.
   */
  it("answers about a tenant that has done nothing without losing a single column", async () => {
    const summary = await svc.summarize(OTHER);

    expect(summary.recommendationCount).toBe(0);
    expect(summary.recommendationsByStatus).toHaveLength(6);
    expect(summary.runsByDisposition).toHaveLength(3);
    expect(summary.recommendationsByStatus.every((entry) => entry.count === 0)).toBe(true);
    expect([summary.acceptanceRate, summary.autonomyRate, summary.humanGatedRate]).toEqual([
      0, 0, 0,
    ]);
  });

  it("reads only inside the tenant asked about", async () => {
    await seed();
    await recommendations.save(
      createRecommendation({
        tenantId: OTHER,
        organizationId: ORG,
        title: "Review the transport route after a third late arrival",
        subjectDomain: "transport",
        subjectId: "route-12",
        impactBand: "cohort",
        riskLevel: "low",
        evidence: [
          citeEvidence({ source: "knowledge_graph", ref: "entity-4", strength: "strong" }),
        ],
      }),
    );

    expect((await svc.summarize(TENANT)).recommendationCount).toBe(5);
    expect((await svc.summarize(OTHER)).recommendationCount).toBe(1);
    expect((await svc.backlog(OTHER, ASOF)).openCount).toBe(1);
  });

  // --- The backlog -----------------------------------------------------------------

  /**
   * The instant is supplied rather than read from a clock, so an operator can ask what the queue looked like at a
   * given moment and get the same answer twice.
   */
  it("separates what is still answerable from what quietly lapsed", async () => {
    const { openHigh, lapsed } = await seed();

    const backlog = await svc.backlog(TENANT, ASOF);

    expect(backlog.openCount).toBe(2);
    expect(backlog.expiredCount).toBe(1);
    expect(backlog.ranked).toHaveLength(3);
    expect(backlog.ranked[0]?.id).toBe(openHigh.id);
    expect(backlog.ranked[2]?.id).toBe(lapsed.id);
    expect(backlog.ranked[2]?.expired).toBe(true);
  });

  it("describes the reach and risk of the live queue only", async () => {
    await seed();

    const backlog = await svc.backlog(TENANT, ASOF);

    expect(tally(backlog.byImpact)).toEqual({
      individual: 1,
      cohort: 0,
      department: 0,
      institution: 1,
    });
    expect(tally(backlog.byRisk)).toEqual({ low: 1, medium: 0, high: 1, critical: 0 });
    expect(backlog.humanGatedCount).toBe(1);
  });

  it("counts nothing as lapsed at a moment before any window closed", async () => {
    await seed();

    const backlog = await svc.backlog(TENANT, "2025-06-01T00:00:00.000Z" as ISODateString);

    expect(backlog.expiredCount).toBe(0);
    expect(backlog.openCount).toBe(3);
  });

  // --- What is outstanding ---------------------------------------------------------

  /**
   * The contract's third rule read as a queue rather than a promise: everything the institution did, declared it
   * could undo, and has not undone — from both sources at once, because the obligation is the same whichever
   * produced it.
   */
  it("gathers what is owed a reversal from decisions and firings alike", async () => {
    await seed();

    const outstanding = await svc.outstandingCompensations(TENANT);

    expect(outstanding.decisions).toHaveLength(1);
    expect(outstanding.decisions[0]?.executionOutcome).toBe("failed");
    expect(outstanding.runs).toHaveLength(1);
    expect(outstanding.runs[0]?.status).toBe("failed");
    expect(outstanding.runs.every((run) => run.compensationState === "available")).toBe(true);
  });

  it("stops listing a firing that has been put back", async () => {
    await seed();
    const owed = (await svc.outstandingCompensations(TENANT)).runs[0];
    expect(owed).toBeDefined();

    if (owed) {
      await runs.save(compensateRun(owed, "reversal-2"));
    }

    expect((await svc.outstandingCompensations(TENANT)).runs).toEqual([]);
    expect((await svc.summarize(TENANT)).compensatedRunCount).toBe(2);
  });

  /** An approval queue that is quietly growing means more was automated than there is attention to supervise. */
  it("hands back every firing the gate stopped and nobody has answered", async () => {
    await seed();

    const queue = await svc.approvalQueue(TENANT);

    expect(queue).toHaveLength(1);
    expect(queue[0]?.status).toBe("awaiting_approval");
    expect(await svc.approvalQueue(OTHER)).toEqual([]);
  });

  it("empties the approval queue once a person has answered", async () => {
    await seed();
    const waiting = (await svc.approvalQueue(TENANT))[0];
    expect(waiting).toBeDefined();

    if (waiting) {
      await runs.save(approveRun(waiting, { approvedByUserId: "user-9" }));
    }

    expect(await svc.approvalQueue(TENANT)).toEqual([]);
  });
});
