import { describe, expect, it } from "vitest";
import type { Reversibility, RiskLevel, ToolEffect } from "./ai-value";
import type { PlanStepView, ToolView } from "./ai-view";
import { highestRisk, inspectPlan, nextExecutableSteps, planProgress } from "./planning";

const tool = (key: string, patch: Partial<ToolView> = {}): ToolView => ({
  key,
  status: "active",
  effect: "read" as ToolEffect,
  riskLevel: "low" as RiskLevel,
  reversibility: "reversible" as Reversibility,
  requiresApproval: false,
  compensationKey: null,
  ...patch,
});

const step = (
  id: string,
  ordinal: number,
  capabilityKey: string,
  patch: Partial<PlanStepView> = {},
): PlanStepView => ({
  id,
  ordinal,
  capabilityKey,
  status: "pending",
  dependsOn: [],
  ...patch,
});

const catalog: readonly ToolView[] = [
  tool("attendance.read"),
  tool("guardian.notify", {
    effect: "write",
    riskLevel: "medium",
    reversibility: "compensatable",
    compensationKey: "guardian.notify.retract",
  }),
  tool("guardian.notify.retract", { effect: "write", riskLevel: "low" }),
  tool("enrolment.withdraw", { effect: "write", riskLevel: "high", reversibility: "irreversible" }),
];

describe("highestRisk", () => {
  it("returns the worst risk present", () => {
    expect(highestRisk(catalog)).toBe("high");
    expect(highestRisk([tool("a"), tool("b", { riskLevel: "critical" })])).toBe("critical");
  });

  it("returns null for no capabilities", () => {
    expect(highestRisk([])).toBeNull();
  });
});

describe("inspectPlan — a plan is inspectable before it runs", () => {
  it("reports a sound plan with its risk and reversibility profile", () => {
    const steps = [
      step("s1", 1, "attendance.read"),
      step("s2", 2, "guardian.notify", { dependsOn: ["s1"] }),
    ];
    const inspection = inspectPlan(steps, catalog);
    expect(inspection.sound).toBe(true);
    expect(inspection.issues).toEqual([]);
    expect(inspection.stepCount).toBe(2);
    expect(inspection.highestRisk).toBe("medium");
    expect(inspection.requiresApproval).toBe(false);
    expect(inspection.compensatableStepIds).toEqual(["s2"]);
    expect(inspection.irreversibleStepIds).toEqual([]);
  });

  it("requires approval when any step is irreversible", () => {
    const inspection = inspectPlan([step("s1", 1, "enrolment.withdraw")], catalog);
    expect(inspection.requiresApproval).toBe(true);
    expect(inspection.irreversibleStepIds).toEqual(["s1"]);
  });

  it("requires approval when any step carries critical risk", () => {
    const withCritical = [...catalog, tool("finance.transfer", { riskLevel: "critical" })];
    const inspection = inspectPlan([step("s1", 1, "finance.transfer")], withCritical);
    expect(inspection.highestRisk).toBe("critical");
    expect(inspection.requiresApproval).toBe(true);
  });

  it("requires approval when a capability declares it always needs a human", () => {
    const withGated = [...catalog, tool("records.publish", { requiresApproval: true })];
    expect(inspectPlan([step("s1", 1, "records.publish")], withGated).requiresApproval).toBe(true);
  });

  it("flags an empty plan", () => {
    const inspection = inspectPlan([], catalog);
    expect(inspection.sound).toBe(false);
    expect(inspection.issues).toEqual([{ stepId: null, code: "empty_plan", ref: null }]);
    expect(inspection.highestRisk).toBeNull();
  });

  it("flags an unknown capability and a deprecated one", () => {
    const stale = [...catalog, tool("library.fine.waive", { status: "deprecated" })];
    const inspection = inspectPlan(
      [step("s1", 1, "does.not.exist"), step("s2", 2, "library.fine.waive")],
      stale,
    );
    expect(inspection.sound).toBe(false);
    expect(inspection.issues).toContainEqual({
      stepId: "s1",
      code: "unknown_capability",
      ref: "does.not.exist",
    });
    expect(inspection.issues).toContainEqual({
      stepId: "s2",
      code: "capability_not_active",
      ref: "library.fine.waive",
    });
  });

  it("flags duplicate ordinals, self-dependency and unknown dependencies", () => {
    const inspection = inspectPlan(
      [
        step("s1", 1, "attendance.read", { dependsOn: ["s1"] }),
        step("s2", 1, "attendance.read", { dependsOn: ["ghost"] }),
      ],
      catalog,
    );
    expect(inspection.issues).toContainEqual({ stepId: "s1", code: "self_dependency", ref: "s1" });
    expect(inspection.issues).toContainEqual({
      stepId: "s2",
      code: "duplicate_ordinal",
      ref: "1",
    });
    expect(inspection.issues).toContainEqual({
      stepId: "s2",
      code: "unknown_dependency",
      ref: "ghost",
    });
  });

  it("detects a dependency cycle and names every step on it", () => {
    const inspection = inspectPlan(
      [
        step("s1", 1, "attendance.read", { dependsOn: ["s3"] }),
        step("s2", 2, "attendance.read", { dependsOn: ["s1"] }),
        step("s3", 3, "attendance.read", { dependsOn: ["s2"] }),
      ],
      catalog,
    );
    const cycled = inspection.issues
      .filter((i) => i.code === "dependency_cycle")
      .map((i) => i.stepId)
      .sort();
    expect(cycled).toEqual(["s1", "s2", "s3"]);
    expect(inspection.sound).toBe(false);
  });

  it("reports every issue rather than stopping at the first", () => {
    const inspection = inspectPlan(
      [step("s1", 1, "nope", { dependsOn: ["s1", "ghost"] })],
      catalog,
    );
    expect(inspection.issues.map((i) => i.code).sort()).toEqual([
      "self_dependency",
      "unknown_capability",
      "unknown_dependency",
    ]);
  });

  it("reports a self-dependency once, under its own code rather than also as a cycle", () => {
    const inspection = inspectPlan(
      [step("s1", 1, "attendance.read", { dependsOn: ["s1"] })],
      catalog,
    );
    expect(inspection.issues).toEqual([{ stepId: "s1", code: "self_dependency", ref: "s1" }]);
  });

  it("does not treat a diamond as a cycle", () => {
    const inspection = inspectPlan(
      [
        step("s1", 1, "attendance.read"),
        step("s2", 2, "attendance.read", { dependsOn: ["s1"] }),
        step("s3", 3, "attendance.read", { dependsOn: ["s1"] }),
        step("s4", 4, "attendance.read", { dependsOn: ["s2", "s3"] }),
      ],
      catalog,
    );
    expect(inspection.sound).toBe(true);
  });
});

describe("nextExecutableSteps", () => {
  it("returns pending steps whose dependencies have all succeeded, in ordinal order", () => {
    const steps = [
      step("s3", 3, "attendance.read", { dependsOn: ["s1"] }),
      step("s1", 1, "attendance.read", { status: "succeeded" }),
      step("s2", 2, "attendance.read", { dependsOn: ["s1"] }),
      step("s4", 4, "attendance.read", { dependsOn: ["s2"] }),
    ];
    expect(nextExecutableSteps(steps).map((s) => s.id)).toEqual(["s2", "s3"]);
  });

  it("does not release a step whose dependency failed, was skipped or is still pending", () => {
    for (const status of ["failed", "skipped", "pending", "executing", "compensated"]) {
      const steps = [
        step("s1", 1, "attendance.read", { status }),
        step("s2", 2, "attendance.read", { dependsOn: ["s1"] }),
      ];
      expect(nextExecutableSteps(steps).map((s) => s.id)).not.toContain("s2");
    }
  });

  it("returns nothing for an empty plan", () => {
    expect(nextExecutableSteps([])).toEqual([]);
  });
});

describe("planProgress", () => {
  it("counts settled steps and reports completeness", () => {
    const progress = planProgress([
      step("s1", 1, "attendance.read", { status: "succeeded" }),
      step("s2", 2, "attendance.read", { status: "failed" }),
      step("s3", 3, "attendance.read", { status: "skipped" }),
      step("s4", 4, "attendance.read", { status: "compensated" }),
      step("s5", 5, "attendance.read"),
    ]);
    expect(progress).toEqual({
      total: 5,
      succeeded: 1,
      failed: 1,
      skipped: 1,
      compensated: 1,
      outstanding: 1,
      percentSettled: 80,
      complete: false,
    });
  });

  it("rounds the settled percentage to two decimals", () => {
    const steps = [
      step("s1", 1, "attendance.read", { status: "succeeded" }),
      step("s2", 2, "attendance.read"),
      step("s3", 3, "attendance.read"),
    ];
    expect(planProgress(steps).percentSettled).toBe(33.33);
  });

  it("treats an empty plan as complete with nothing outstanding", () => {
    expect(planProgress([])).toEqual({
      total: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      compensated: 0,
      outstanding: 0,
      percentSettled: 100,
      complete: true,
    });
  });
});
