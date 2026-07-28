import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  AnonymousWorkflowActionError,
  EmptyWorkflowSubjectError,
  InvalidStageTransitionError,
  RequiredStageNotSkippableError,
  StageDependenciesUnsettledError,
  StageRunNotFoundError,
  WorkflowInstanceNotRunningError,
  WorkflowNotPublishedError,
} from "./errors";
import { planReversal } from "./reversal";
import type {
  CreateWorkflowParams,
  DefineStageParams,
  WorkflowDefinition,
  WorkflowStage,
} from "./workflow";
import { createWorkflow, defineStage, publishWorkflow, toWorkflowStageViews } from "./workflow";
import type { StartWorkflowInstanceParams, WorkflowInstance } from "./workflow-instance";
import {
  beginStage,
  cancelWorkflowInstance,
  compensateStage,
  completeStage,
  completedStageKeys,
  failStage,
  instanceStageRun,
  isWorkflowInstanceRunning,
  readyInstanceStageKeys,
  skipStage,
  startWorkflowInstance,
  toInstanceSummaryView,
  toStageRunViews,
  workflowInstanceProgress,
} from "./workflow-instance";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;

const stage = (patch: Partial<DefineStageParams> = {}): WorkflowStage =>
  defineStage({
    key: "review",
    name: "Pastoral review",
    ordinal: 1,
    kind: "human_task",
    riskLevel: "low",
    reversibility: "reversible",
    ...patch,
  });

/** Intake, then a compensatable automated flag, then an optional notification. */
const THREE_STAGES = [
  stage({ key: "intake", name: "Intake", ordinal: 1 }),
  stage({
    key: "flag",
    name: "Flag as at risk",
    ordinal: 2,
    kind: "automated_action",
    capabilityKey: "attendance.flag_at_risk",
    reversibility: "compensatable",
    compensationKey: "attendance.clear_flag",
    dependsOn: ["intake"],
  }),
  stage({
    key: "notify",
    name: "Notify the guardian",
    ordinal: 3,
    kind: "notification",
    dependsOn: ["flag"],
    optional: true,
  }),
];

const workflow = (patch: Partial<CreateWorkflowParams> = {}): WorkflowDefinition =>
  publishWorkflow(
    createWorkflow({
      tenantId: TENANT,
      organizationId: ORG,
      key: "attendance-intervention",
      name: "Attendance intervention",
      trigger: "manual",
      stages: [stage()],
      ...patch,
    }),
  );

const instance = (
  patch: Partial<StartWorkflowInstanceParams> = {},
  definition: WorkflowDefinition = workflow(),
): WorkflowInstance =>
  startWorkflowInstance(definition, {
    subjectDomain: "attendance",
    subjectId: "student-4471",
    triggeredByUserId: "user-1",
    ...patch,
  });

/** A three-stage case, with intake completed and the automated flag active. */
const midFlight = (): WorkflowInstance => {
  const started = instance({}, workflow({ stages: THREE_STAGES }));
  return beginStage(completeStage(beginStage(started, "intake"), "intake"), "flag");
};

describe("starting a case", () => {
  it("snapshots the definition it started under", () => {
    const definition = workflow({ stages: THREE_STAGES });
    const started = instance({}, definition);

    expect(started.workflowId).toBe(definition.id);
    expect(started.workflowKey).toBe("attendance-intervention");
    expect(started.workflowVersion).toBe(1);
    expect(started.stageRuns.map((run) => run.stageKey)).toEqual(["intake", "flag", "notify"]);
  });

  it("starts every stage pending, with nothing settled", () => {
    const started = instance({}, workflow({ stages: THREE_STAGES }));

    expect(started.stageRuns.every((run) => run.status === "pending")).toBe(true);
    expect(started.stageRuns.every((run) => run.startedAt === null)).toBe(true);
    expect(started.status).toBe("running");
    expect(isWorkflowInstanceRunning(started)).toBe(true);
  });

  it("carries each stage's optionality and dependencies onto its run", () => {
    const started = instance({}, workflow({ stages: THREE_STAGES }));

    expect(instanceStageRun(started, "notify")?.optional).toBe(true);
    expect(instanceStageRun(started, "flag")?.optional).toBe(false);
    expect(instanceStageRun(started, "flag")?.dependsOn).toEqual(["intake"]);
  });

  it("normalizes the subject the way every other subject in this domain is normalized", () => {
    const started = instance({ subjectDomain: "  Attendance  ", subjectId: "  student-4471  " });

    expect(started.subjectDomain).toBe("attendance");
    expect(started.subjectId).toBe("student-4471");
  });

  it("refuses a case that names no subject", () => {
    expect(() => instance({ subjectId: "   " })).toThrow(EmptyWorkflowSubjectError);
  });

  it("links the case to the recommendation it came out of, when it came out of one", () => {
    expect(instance({ recommendationId: "rec-1" as Uuid }).recommendationId).toBe("rec-1");
    expect(instance().recommendationId).toBeNull();
  });

  it("refuses to start a case on a draft, which was never inspected", () => {
    const unpublished = createWorkflow({
      tenantId: TENANT,
      organizationId: ORG,
      key: "attendance-intervention",
      name: "Attendance intervention",
      trigger: "manual",
      stages: [stage()],
    });

    let thrown: unknown;
    try {
      instance({}, unpublished);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(WorkflowNotPublishedError);
    expect((thrown as WorkflowNotPublishedError).details).toMatchObject({ status: "draft" });
  });
});

describe("a case a person started names that person", () => {
  it("requires a person behind a manually triggered workflow", () => {
    let thrown: unknown;
    try {
      instance({ triggeredByUserId: null });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AnonymousWorkflowActionError);
    expect((thrown as AnonymousWorkflowActionError).details).toEqual({ action: "started" });
  });

  it("treats a blank name as no name at all", () => {
    expect(() => instance({ triggeredByUserId: "   " })).toThrow(AnonymousWorkflowActionError);
  });

  it("lets a signal-triggered workflow start with nobody behind it", () => {
    const started = instance(
      { triggeredByUserId: null },
      workflow({ trigger: "signal", triggerSignalKey: "attendance.streak_broken" }),
    );

    expect(started.trigger).toBe("signal");
    expect(started.triggeredByUserId).toBeNull();
  });

  it("records the automation rule that started it instead of a person", () => {
    const started = instance(
      { triggeredByUserId: null, triggeredByRuleId: "rule-1" },
      workflow({ trigger: "automation" }),
    );

    expect(started.triggeredByUserId).toBeNull();
    expect(started.triggeredByRuleId).toBe("rule-1");
  });
});

describe("a stage begins only once what it waits on has settled", () => {
  it("begins a stage with nothing in front of it", () => {
    const started = beginStage(instance({}, workflow({ stages: THREE_STAGES })), "intake");
    const run = instanceStageRun(started, "intake");

    expect(run?.status).toBe("active");
    expect(run?.startedAt).not.toBeNull();
  });

  it("refuses a stage whose dependency has not settled, naming what it is waiting for", () => {
    let thrown: unknown;
    try {
      beginStage(instance({}, workflow({ stages: THREE_STAGES })), "flag");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(StageDependenciesUnsettledError);
    expect((thrown as StageDependenciesUnsettledError).details).toEqual({
      stageKey: "flag",
      unsatisfied: ["intake"],
    });
  });

  it("releases a dependent stage once its dependency completes", () => {
    const started = instance({}, workflow({ stages: THREE_STAGES }));
    const done = completeStage(beginStage(started, "intake"), "intake");

    expect(readyInstanceStageKeys(done)).toEqual(["flag"]);
    expect(beginStage(done, "flag").status).toBe("running");
  });

  it("releases a dependent stage once its dependency is skipped", () => {
    const optionalFirst = workflow({
      stages: [
        stage({ key: "intake", name: "Intake", ordinal: 1, optional: true }),
        stage({ key: "flag", name: "Flag", ordinal: 2, dependsOn: ["intake"] }),
      ],
    });
    const skipped = skipStage(instance({}, optionalFirst), "intake");

    expect(readyInstanceStageKeys(skipped)).toEqual(["flag"]);
  });

  it("records who the stage fell to when it began", () => {
    const started = beginStage(instance({}, workflow({ stages: THREE_STAGES })), "intake", {
      assignedToUserId: "user-2",
    });

    expect(instanceStageRun(started, "intake")?.assignedToUserId).toBe("user-2");
  });

  it("refuses to begin a stage that is already active", () => {
    const started = beginStage(instance(), "review");

    let thrown: unknown;
    try {
      beginStage(started, "review");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidStageTransitionError);
    expect((thrown as InvalidStageTransitionError).details).toEqual({
      stageKey: "review",
      from: "active",
      to: "active",
    });
  });

  it("refuses a stage this case does not carry", () => {
    let thrown: unknown;
    try {
      beginStage(instance(), "nope");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(StageRunNotFoundError);
    expect((thrown as StageRunNotFoundError).details).toMatchObject({ stageKey: "nope" });
  });

  it("offers nothing as ready once the case has settled", () => {
    const cancelled = cancelWorkflowInstance(instance(), { cancelledByUserId: "user-1" });

    expect(readyInstanceStageKeys(cancelled)).toEqual([]);
  });
});

describe("completing a stage", () => {
  it("settles the stage and records what came back from the runtime", () => {
    const done = completeStage(midFlight(), "flag", {
      note: "  Flag raised  ",
      executionRef: " inv-1 ",
    });
    const run = instanceStageRun(done, "flag");

    expect(run?.status).toBe("completed");
    expect(run?.settledAt).not.toBeNull();
    expect(run?.note).toBe("Flag raised");
    expect(run?.executionRef).toBe("inv-1");
  });

  it("refuses to complete a stage that never began", () => {
    expect(() => completeStage(instance(), "review")).toThrow(InvalidStageTransitionError);
  });

  it("settles the whole case once nothing is left outstanding", () => {
    const done = completeStage(beginStage(instance(), "review"), "review");

    expect(done.status).toBe("completed");
    expect(done.settledAt).not.toBeNull();
    expect(isWorkflowInstanceRunning(done)).toBe(false);
  });

  it("leaves the case running while anything is still outstanding", () => {
    const done = completeStage(midFlight(), "flag");

    expect(done.status).toBe("running");
    expect(workflowInstanceProgress(done).outstanding).toBe(1);
  });

  it("settles the case when the last outstanding stage is skipped rather than completed", () => {
    const done = skipStage(completeStage(midFlight(), "flag"), "notify");

    expect(done.status).toBe("completed");
  });

  it("refuses any stage transition once the case has settled", () => {
    const done = completeStage(beginStage(instance(), "review"), "review");

    let thrown: unknown;
    try {
      beginStage(done, "review");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(WorkflowInstanceNotRunningError);
    expect((thrown as WorkflowInstanceNotRunningError).details).toMatchObject({
      status: "completed",
    });
  });
});

describe("only an optional stage may be skipped", () => {
  it("skips an optional stage that has not begun", () => {
    const skipped = skipStage(completeStage(midFlight(), "flag"), "notify", {
      note: "no guardian",
    });
    const run = instanceStageRun(skipped, "notify");

    expect(run?.status).toBe("skipped");
    expect(run?.note).toBe("no guardian");
  });

  it("skips an optional stage that had already begun", () => {
    const started = beginStage(completeStage(midFlight(), "flag"), "notify");

    expect(skipStage(started, "notify").status).toBe("completed");
  });

  it("refuses to skip a required stage, so a case cannot report doing work it never did", () => {
    let thrown: unknown;
    try {
      skipStage(instance({}, workflow({ stages: THREE_STAGES })), "intake");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(RequiredStageNotSkippableError);
    expect((thrown as RequiredStageNotSkippableError).details).toEqual({ stageKey: "intake" });
  });

  it("refuses to skip a stage that has already settled", () => {
    const done = completeStage(midFlight(), "flag");

    expect(() => skipStage(done, "flag")).toThrow(InvalidStageTransitionError);
  });
});

describe("a failed stage stops the case", () => {
  it("fails the instance at the stage that did not work, and says why", () => {
    const failed = failStage(midFlight(), "flag", { error: "  capability timed out  " });

    expect(failed.status).toBe("failed");
    expect(failed.failureStageKey).toBe("flag");
    expect(failed.failureError).toBe("capability timed out");
    expect(failed.settledAt).not.toBeNull();
  });

  it("does not release the stages waiting behind the failure", () => {
    const failed = failStage(midFlight(), "flag", { error: "capability timed out" });

    expect(readyInstanceStageKeys(failed)).toEqual([]);
    expect(instanceStageRun(failed, "notify")?.status).toBe("pending");
  });

  it("keeps the runtime's reference for the invocation that failed", () => {
    const failed = failStage(midFlight(), "flag", { error: "timeout", executionRef: "inv-1" });

    expect(instanceStageRun(failed, "flag")?.executionRef).toBe("inv-1");
  });

  it("refuses to fail a stage that never began", () => {
    expect(() => failStage(instance(), "review", { error: "nope" })).toThrow(
      InvalidStageTransitionError,
    );
  });
});

describe("rule three — putting a case back", () => {
  it("compensates a completed stage after the case has already failed", () => {
    const flagged = completeStage(midFlight(), "flag");
    const failed = failStage(beginStage(flagged, "notify"), "notify", { error: "no route" });
    const compensated = compensateStage(failed, "flag");

    expect(failed.status).toBe("failed");
    expect(instanceStageRun(compensated, "flag")?.status).toBe("compensated");
  });

  it("compensates a completed stage of a cancelled case", () => {
    const cancelled = cancelWorkflowInstance(completeStage(midFlight(), "flag"), {
      cancelledByUserId: "user-1",
    });

    expect(instanceStageRun(compensateStage(cancelled, "flag"), "flag")?.status).toBe(
      "compensated",
    );
  });

  it("refuses to compensate a stage that never completed", () => {
    let thrown: unknown;
    try {
      compensateStage(midFlight(), "flag");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidStageTransitionError);
    expect((thrown as InvalidStageTransitionError).details).toEqual({
      stageKey: "flag",
      from: "active",
      to: "compensated",
    });
  });

  it("refuses to compensate the same stage twice", () => {
    const cancelled = cancelWorkflowInstance(completeStage(midFlight(), "flag"), {
      cancelledByUserId: "user-1",
    });
    const once = compensateStage(cancelled, "flag");

    expect(() => compensateStage(once, "flag")).toThrow(InvalidStageTransitionError);
  });

  it("hands the reversal engine a plan for what the case actually did", () => {
    const definition = workflow({ stages: THREE_STAGES });
    const done = completeStage(midFlight(), "flag");
    const plan = planReversal(toWorkflowStageViews(definition), toStageRunViews(done));

    expect(plan.steps).toEqual([
      {
        stageKey: "flag",
        capabilityKey: "attendance.flag_at_risk",
        compensationKey: "attendance.clear_flag",
        ordinal: 1,
      },
    ]);
    expect(plan.fullyReversible).toBe(true);
  });
});

describe("cancelling a case", () => {
  it("settles the case and names the person who stopped it", () => {
    const cancelled = cancelWorkflowInstance(midFlight(), {
      cancelledByUserId: "user-1",
      reason: "  learner transferred  ",
    });

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelledByUserId).toBe("user-1");
    expect(cancelled.cancellationReason).toBe("learner transferred");
    expect(cancelled.settledAt).not.toBeNull();
  });

  it("skips everything still outstanding, whatever its optionality", () => {
    const cancelled = cancelWorkflowInstance(midFlight(), { cancelledByUserId: "user-1" });

    expect(instanceStageRun(cancelled, "flag")?.status).toBe("skipped");
    expect(instanceStageRun(cancelled, "notify")?.status).toBe("skipped");
    expect(workflowInstanceProgress(cancelled).outstanding).toBe(0);
  });

  it("leaves what was already completed completed, so a reversal can still find it", () => {
    const cancelled = cancelWorkflowInstance(midFlight(), { cancelledByUserId: "user-1" });

    expect(instanceStageRun(cancelled, "intake")?.status).toBe("completed");
    expect(completedStageKeys(cancelled)).toEqual(["intake"]);
  });

  it("refuses a cancellation with nobody behind it", () => {
    let thrown: unknown;
    try {
      cancelWorkflowInstance(midFlight(), { cancelledByUserId: "   " });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AnonymousWorkflowActionError);
    expect((thrown as AnonymousWorkflowActionError).details).toEqual({ action: "cancelled" });
  });

  it("refuses to cancel a case that has already settled", () => {
    const cancelled = cancelWorkflowInstance(midFlight(), { cancelledByUserId: "user-1" });

    expect(() => cancelWorkflowInstance(cancelled, { cancelledByUserId: "user-2" })).toThrow(
      WorkflowInstanceNotRunningError,
    );
  });
});

describe("what the engines are given to read", () => {
  it("hands the orchestration and reversal engines the stage runs themselves", () => {
    const started = instance({}, workflow({ stages: THREE_STAGES }));

    expect(toStageRunViews(started)).toEqual(started.stageRuns);
  });

  it("reports progress through the case", () => {
    const progress = workflowInstanceProgress(completeStage(midFlight(), "flag"));

    expect(progress).toMatchObject({
      total: 3,
      completed: 2,
      outstanding: 1,
      percentSettled: 66.67,
      complete: false,
    });
  });

  it("hands the metrics engine only the case's identity and status", () => {
    const started = instance();

    expect(toInstanceSummaryView(started)).toEqual({ id: started.id, status: "running" });
  });

  it("looks a stage run up by key, normalizing the way in", () => {
    expect(instanceStageRun(instance(), "  REVIEW  ")?.ordinal).toBe(1);
    expect(instanceStageRun(instance(), "nope")).toBeNull();
  });
});
