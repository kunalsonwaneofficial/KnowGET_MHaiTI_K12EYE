import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import type { ToolView } from "./ai-view";
import {
  EmptyPlanGoalError,
  InvalidPlanTransitionError,
  InvalidStepTransitionError,
  PlanApprovalRequiredError,
  PlanNotSettledError,
  PlanStepNotFoundError,
  StepDependedUponError,
  StepDependencyNotMetError,
  UnknownStepDependencyError,
  UnsoundPlanError,
} from "./errors";
import {
  type CreateExecutionPlanParams,
  type ExecutionPlan,
  addPlanStep,
  approveExecutionPlan,
  beginStep,
  cancelExecution,
  compensateStep,
  completeExecution,
  createExecutionPlan,
  executionProgress,
  failExecution,
  failStep,
  inspectExecutionPlan,
  isPlanRunnable,
  rejectExecutionPlan,
  removePlanStep,
  restatePlanGoal,
  rollBackExecution,
  skipStep,
  startExecution,
  submitExecutionPlan,
  succeedStep,
  toPlanStepViews,
  toPlanView,
} from "./execution-plan";

const base: CreateExecutionPlanParams = {
  tenantId: "t1" as TenantId,
  organizationId: "org1" as Uuid,
  agentId: "agent-1",
  goal: "  Chase up unexplained absences from yesterday.  ",
};

const tool = (key: string, patch: Partial<ToolView> = {}): ToolView => ({
  key,
  status: "active",
  effect: "read",
  riskLevel: "low",
  reversibility: "reversible",
  requiresApproval: false,
  compensationKey: null,
  ...patch,
});

const CATALOG: readonly ToolView[] = [
  tool("attendance.read"),
  tool("guardian.notify", { effect: "write", riskLevel: "medium" }),
];

/** A two-step plan, the second waiting on the first, submitted and started. */
const runningPlan = (): ExecutionPlan => {
  const drafted = addPlanStep(
    addPlanStep(createExecutionPlan(base), {
      capabilityKey: "attendance.read",
    }),
    { capabilityKey: "guardian.notify" },
  );
  const [first] = drafted.steps;
  const linked = addPlanStep(drafted, {
    capabilityKey: "guardian.notify",
    dependsOn: [first?.id ?? ""],
  });
  return startExecution(submitExecutionPlan(linked, CATALOG));
};

describe("ExecutionPlan — the artifact that makes intentions inspectable", () => {
  it("drafts with a trimmed goal, no steps and nothing decided", () => {
    const plan = createExecutionPlan(base);
    expect(plan.goal).toBe("Chase up unexplained absences from yesterday.");
    expect(plan.status).toBe("drafted");
    expect(plan.steps).toEqual([]);
    expect(plan.requiresApproval).toBe(false);
    expect(plan.approvalRequestId).toBeNull();
    expect(plan.inspectedAt).toBeNull();
    expect(plan.reasoningSessionId).toBeNull();
  });

  it("requires a goal — a plan no human can read is not an inspectable plan", () => {
    expect(() => createExecutionPlan({ ...base, goal: "   " })).toThrow(EmptyPlanGoalError);
  });

  it("remembers the reasoning session it came out of", () => {
    expect(createExecutionPlan({ ...base, reasoningSessionId: "sess-1" }).reasoningSessionId).toBe(
      "sess-1",
    );
  });

  it("restates its goal while drafted and refuses once submitted", () => {
    const plan = restatePlanGoal(createExecutionPlan(base), "  Notify guardians.  ");
    expect(plan.goal).toBe("Notify guardians.");
    expect(() => restatePlanGoal(plan, "  ")).toThrow(EmptyPlanGoalError);

    const submitted = submitExecutionPlan(
      addPlanStep(plan, { capabilityKey: "attendance.read" }),
      CATALOG,
    );
    expect(() => restatePlanGoal(submitted, "later")).toThrow(InvalidPlanTransitionError);
  });
});

describe("authoring steps — a plan can only be built as a DAG", () => {
  it("assigns ordinals, normalizes the capability key and trims the intent", () => {
    const plan = addPlanStep(
      addPlanStep(createExecutionPlan(base), {
        capabilityKey: " Attendance.Read ",
        intent: "  Pull yesterday's register.  ",
      }),
      { capabilityKey: "guardian.notify" },
    );

    expect(plan.steps.map((step) => step.ordinal)).toEqual([1, 2]);
    expect(plan.steps[0]?.capabilityKey).toBe("attendance.read");
    expect(plan.steps[0]?.intent).toBe("Pull yesterday's register.");
    expect(plan.steps[0]?.status).toBe("pending");
    expect(plan.steps[0]?.invocationId).toBeNull();
  });

  it("only lets a step wait on steps already in the plan, so a cycle cannot be authored", () => {
    const first = addPlanStep(createExecutionPlan(base), { capabilityKey: "attendance.read" });
    const firstId = first.steps[0]?.id ?? "";
    const both = addPlanStep(first, {
      capabilityKey: "guardian.notify",
      dependsOn: [firstId, firstId],
    });
    expect(both.steps[1]?.dependsOn).toEqual([firstId]);

    expect(() =>
      addPlanStep(both, { capabilityKey: "attendance.read", dependsOn: ["nowhere"] }),
    ).toThrow(UnknownStepDependencyError);
  });

  it("removes a step and renumbers, but refuses while another waits on it", () => {
    const first = addPlanStep(createExecutionPlan(base), { capabilityKey: "attendance.read" });
    const firstId = first.steps[0]?.id ?? "";
    const both = addPlanStep(first, { capabilityKey: "guardian.notify", dependsOn: [firstId] });

    expect(() => removePlanStep(both, firstId)).toThrow(StepDependedUponError);
    expect(() => removePlanStep(both, "nowhere")).toThrow(PlanStepNotFoundError);

    const trimmed = removePlanStep(both, both.steps[1]?.id ?? "");
    expect(trimmed.steps.map((step) => step.ordinal)).toEqual([1]);
  });

  it("refuses to author a plan that has left the drafting table", () => {
    const submitted = submitExecutionPlan(
      addPlanStep(createExecutionPlan(base), { capabilityKey: "attendance.read" }),
      CATALOG,
    );
    expect(() => addPlanStep(submitted, { capabilityKey: "guardian.notify" })).toThrow(
      InvalidPlanTransitionError,
    );
    expect(() => removePlanStep(submitted, submitted.steps[0]?.id ?? "")).toThrow(
      InvalidPlanTransitionError,
    );
  });
});

describe("inspection and submission — the two gates", () => {
  it("inspects without moving the plan", () => {
    const plan = addPlanStep(createExecutionPlan(base), { capabilityKey: "guardian.notify" });
    const inspection = inspectExecutionPlan(plan, CATALOG);
    expect(inspection.sound).toBe(true);
    expect(inspection.stepCount).toBe(1);
    expect(inspection.highestRisk).toBe("medium");
    expect(plan.status).toBe("drafted");
    expect(plan.inspectedAt).toBeNull();
  });

  it("refuses an unsound plan and reports every issue, not just the first", () => {
    const plan = addPlanStep(
      addPlanStep(createExecutionPlan(base), {
        capabilityKey: "fees.waive",
      }),
      { capabilityKey: "attendance.purge" },
    );

    let thrown: unknown;
    try {
      submitExecutionPlan(plan, CATALOG);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(UnsoundPlanError);
    expect((thrown as UnsoundPlanError).details).toMatchObject({
      issues: [
        { code: "unknown_capability", ref: "fees.waive" },
        { code: "unknown_capability", ref: "attendance.purge" },
      ],
    });
  });

  it("refuses an empty plan", () => {
    expect(() => submitExecutionPlan(createExecutionPlan(base), CATALOG)).toThrow(UnsoundPlanError);
  });

  it("approves a sound, ungated plan outright and records the inspection", () => {
    const plan = submitExecutionPlan(
      addPlanStep(createExecutionPlan(base), { capabilityKey: "attendance.read" }),
      CATALOG,
    );
    expect(plan.status).toBe("approved");
    expect(plan.requiresApproval).toBe(false);
    expect(plan.inspectedAt).not.toBeNull();
    expect(isPlanRunnable(plan)).toBe(true);
  });

  it("holds a plan containing something irreversible for a human", () => {
    const catalog = [...CATALOG, tool("student.expunge", { reversibility: "irreversible" })];
    const plan = submitExecutionPlan(
      addPlanStep(createExecutionPlan(base), { capabilityKey: "student.expunge" }),
      catalog,
    );
    expect(plan.status).toBe("awaiting_approval");
    expect(plan.requiresApproval).toBe(true);
    expect(isPlanRunnable(plan)).toBe(false);
  });

  it("refuses to submit twice", () => {
    const plan = submitExecutionPlan(
      addPlanStep(createExecutionPlan(base), { capabilityKey: "attendance.read" }),
      CATALOG,
    );
    expect(() => submitExecutionPlan(plan, CATALOG)).toThrow(InvalidPlanTransitionError);
  });
});

describe("the human gate is enforced by the plan itself", () => {
  const gatedCatalog = [...CATALOG, tool("fees.waive", { requiresApproval: true })];
  const gated = (): ExecutionPlan =>
    submitExecutionPlan(
      addPlanStep(createExecutionPlan(base), { capabilityKey: "fees.waive" }),
      gatedCatalog,
    );

  it("will not start a plan that is waiting on a person", () => {
    const plan = gated();
    expect(plan.status).toBe("awaiting_approval");
    expect(() => startExecution(plan)).toThrow(PlanApprovalRequiredError);
  });

  it("runs once a human has approved, and records which request decided it", () => {
    const approved = approveExecutionPlan(gated(), "appr-1");
    expect(approved.status).toBe("approved");
    expect(approved.approvalRequestId).toBe("appr-1");
    expect(startExecution(approved).status).toBe("executing");
  });

  it("stops for good when a human refuses", () => {
    const rejected = rejectExecutionPlan(gated(), "appr-1");
    expect(rejected.status).toBe("rejected");
    expect(rejected.approvalRequestId).toBe("appr-1");
    expect(() => startExecution(rejected)).toThrow(InvalidPlanTransitionError);
    expect(() => approveExecutionPlan(rejected, "appr-2")).toThrow(InvalidPlanTransitionError);
  });

  it("refuses an approval for a plan that never needed one", () => {
    const plan = submitExecutionPlan(
      addPlanStep(createExecutionPlan(base), { capabilityKey: "attendance.read" }),
      CATALOG,
    );
    expect(() => approveExecutionPlan(plan, "appr-1")).toThrow(InvalidPlanTransitionError);
    expect(() => rejectExecutionPlan(plan, "appr-1")).toThrow(InvalidPlanTransitionError);
  });

  it("refuses to start a plan that was never submitted", () => {
    expect(() => startExecution(createExecutionPlan(base))).toThrow(InvalidPlanTransitionError);
  });
});

describe("step execution", () => {
  it("walks a step pending → executing → succeeded and records its invocation", () => {
    const plan = runningPlan();
    const stepId = plan.steps[0]?.id ?? "";
    const done = succeedStep(beginStep(plan, stepId), stepId, "inv-1");
    expect(done.steps[0]?.status).toBe("succeeded");
    expect(done.steps[0]?.invocationId).toBe("inv-1");
  });

  it("will not begin a step whose dependency has not succeeded", () => {
    const plan = runningPlan();
    const dependent = plan.steps[2]?.id ?? "";
    expect(() => beginStep(plan, dependent)).toThrow(StepDependencyNotMetError);

    const first = plan.steps[0]?.id ?? "";
    const ready = succeedStep(beginStep(plan, first), first, "inv-1");
    expect(beginStep(ready, dependent).steps[2]?.status).toBe("executing");
  });

  it("will not begin a step unless the plan is executing", () => {
    const approved = submitExecutionPlan(
      addPlanStep(createExecutionPlan(base), { capabilityKey: "attendance.read" }),
      CATALOG,
    );
    expect(() => beginStep(approved, approved.steps[0]?.id ?? "")).toThrow(
      InvalidPlanTransitionError,
    );
  });

  it("refuses a step that is not part of the plan", () => {
    expect(() => beginStep(runningPlan(), "nowhere")).toThrow(PlanStepNotFoundError);
  });

  it("fails, skips and compensates only from the states that allow it", () => {
    const plan = runningPlan();
    const first = plan.steps[0]?.id ?? "";
    const second = plan.steps[1]?.id ?? "";

    expect(() => succeedStep(plan, first, "inv-1")).toThrow(InvalidStepTransitionError);
    const failed = failStep(beginStep(plan, first), first, "inv-1");
    expect(failed.steps[0]?.status).toBe("failed");
    expect(failed.steps[0]?.invocationId).toBe("inv-1");

    const skipped = skipStep(failed, second);
    expect(skipped.steps[1]?.status).toBe("skipped");
    expect(() => skipStep(skipped, second)).toThrow(InvalidStepTransitionError);
    expect(() => compensateStep(skipped, second)).toThrow(InvalidStepTransitionError);
  });

  it("compensates a step that had succeeded", () => {
    const plan = runningPlan();
    const first = plan.steps[0]?.id ?? "";
    const done = succeedStep(beginStep(plan, first), first, "inv-1");
    expect(compensateStep(done, first).steps[0]?.status).toBe("compensated");
  });
});

describe("finishing a plan", () => {
  it("refuses to complete while steps are outstanding, and completes once none are", () => {
    const plan = runningPlan();
    expect(() => completeExecution(plan)).toThrow(PlanNotSettledError);

    let settled = plan;
    for (const step of plan.steps) {
      settled = skipStep(settled, step.id);
    }
    const done = completeExecution(settled);
    expect(done.status).toBe("completed");
    expect(executionProgress(done).complete).toBe(true);
  });

  it("fails, then rolls back", () => {
    const failed = failExecution(runningPlan());
    expect(failed.status).toBe("failed");
    expect(rollBackExecution(failed).status).toBe("rolled_back");
  });

  it("rolls back straight from executing — a rollback is sometimes what stops a plan", () => {
    expect(rollBackExecution(runningPlan()).status).toBe("rolled_back");
  });

  it("cancels from any live state and never from a terminal one", () => {
    expect(cancelExecution(createExecutionPlan(base)).status).toBe("cancelled");
    const cancelled = cancelExecution(runningPlan());
    expect(cancelled.status).toBe("cancelled");
    expect(() => cancelExecution(cancelled)).toThrow(InvalidPlanTransitionError);
    expect(() => failExecution(cancelled)).toThrow(InvalidPlanTransitionError);
    expect(() => rollBackExecution(cancelled)).toThrow(InvalidPlanTransitionError);
  });
});

describe("views", () => {
  it("gives the planning engine the steps it reads", () => {
    const plan = runningPlan();
    const views = toPlanStepViews(plan);
    expect(views).toHaveLength(3);
    expect(views[2]).toEqual({
      id: plan.steps[2]?.id,
      ordinal: 3,
      capabilityKey: "guardian.notify",
      status: "pending",
      dependsOn: [plan.steps[0]?.id],
    });
  });

  it("gives the metrics engine what it counts", () => {
    const plan = runningPlan();
    expect(toPlanView(plan)).toEqual({ id: plan.id, agentId: "agent-1", status: "executing" });
  });

  it("reports progress as steps settle", () => {
    const plan = runningPlan();
    const first = plan.steps[0]?.id ?? "";
    const after = succeedStep(beginStep(plan, first), first, "inv-1");
    expect(executionProgress(after)).toMatchObject({
      total: 3,
      succeeded: 1,
      outstanding: 2,
      percentSettled: 33.33,
      complete: false,
    });
  });
});
