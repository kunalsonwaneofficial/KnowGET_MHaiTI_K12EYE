import { describe, expect, it } from "vitest";
import {
  inspectWorkflow,
  instanceProgress,
  isAutoExecutableStage,
  isHumanGatedStage,
  isPublishableWorkflow,
  overdueStages,
  readyStageKeys,
  stageExecutionLayers,
  workflowIssueCodes,
} from "./orchestration";
import type { StageRunView, WorkflowStageView } from "./decision-view";

type StageDef = Partial<WorkflowStageView> & { key: string };

const stage = (patch: StageDef): WorkflowStageView => ({
  ordinal: 1,
  kind: "human_task",
  capabilityKey: null,
  riskLevel: "low",
  reversibility: "reversible",
  compensationKey: null,
  dependsOn: [],
  slaHours: null,
  optional: false,
  ...patch,
});

/** Build a definition, numbering the stages in the order given unless a test says otherwise. */
const flow = (...defs: readonly StageDef[]): readonly WorkflowStageView[] =>
  defs.map((def, index) => stage({ ordinal: index + 1, ...def }));

const run = (patch: Partial<StageRunView> & { stageKey: string }): StageRunView => ({
  ordinal: 1,
  status: "pending",
  startedAt: null,
  settledAt: null,
  ...patch,
});

const action = (patch: StageDef): StageDef => ({
  kind: "automated_action",
  capabilityKey: "attendance.notify_guardian",
  ...patch,
});

describe("a definition with nothing in it", () => {
  it("is not sound and says why", () => {
    const inspection = inspectWorkflow([]);
    expect(inspection.sound).toBe(false);
    expect(inspection.issues).toEqual([{ stageKey: null, code: "empty_workflow", ref: null }]);
  });

  it("reports no risk rather than the lowest risk", () => {
    expect(inspectWorkflow([]).highestRisk).toBeNull();
    expect(inspectWorkflow([]).stageCount).toBe(0);
  });

  it("cannot be published", () => {
    expect(isPublishableWorkflow([])).toBe(false);
  });
});

describe("stage keys and ordinals", () => {
  it("rejects two stages sharing a key", () => {
    const inspection = inspectWorkflow(flow({ key: "review" }, { key: "review" }));
    expect(inspection.issues).toContainEqual({
      stageKey: "review",
      code: "duplicate_stage_key",
      ref: null,
    });
  });

  it("rejects two stages sharing an ordinal", () => {
    const inspection = inspectWorkflow([
      stage({ key: "a", ordinal: 1 }),
      stage({ key: "b", ordinal: 1 }),
    ]);
    expect(inspection.issues).toContainEqual({
      stageKey: "b",
      code: "duplicate_ordinal",
      ref: "1",
    });
  });

  it("accepts ordinals that disagree with the dependency order — reading order is not execution order", () => {
    const definition = [
      stage({ key: "second", ordinal: 1, dependsOn: ["first"] }),
      stage({ key: "first", ordinal: 2 }),
    ];
    expect(inspectWorkflow(definition).sound).toBe(true);
    expect(stageExecutionLayers(definition)).toEqual([["first"], ["second"]]);
  });
});

describe("dependencies that do not exist", () => {
  const broken = flow({ key: "notify", dependsOn: ["approval"] });

  it("names the stage and the dependency it could not find", () => {
    expect(inspectWorkflow(broken).issues).toContainEqual({
      stageKey: "notify",
      code: "unknown_dependency",
      ref: "approval",
    });
  });

  it("also reports the consequence — the stage can never run", () => {
    expect(workflowIssueCodes(inspectWorkflow(broken))).toEqual([
      "unknown_dependency",
      "unreachable_stage",
    ]);
  });
});

describe("a stage that depends on itself", () => {
  const looped = flow({ key: "review", dependsOn: ["review"] });

  it("is reported as self-dependency, not as a cycle", () => {
    expect(workflowIssueCodes(inspectWorkflow(looped))).toEqual(["self_dependency"]);
  });

  it("does not strand the rest of the definition behind it", () => {
    const inspection = inspectWorkflow(
      flow({ key: "review", dependsOn: ["review"] }, { key: "notify", dependsOn: ["review"] }),
    );
    expect(workflowIssueCodes(inspection)).toEqual(["self_dependency"]);
  });
});

describe("a definition that loops", () => {
  it("names the stages actually in the loop", () => {
    const inspection = inspectWorkflow(
      flow({ key: "a", dependsOn: ["b"] }, { key: "b", dependsOn: ["a"] }),
    );
    expect(inspection.issues).toEqual([
      { stageKey: "a", code: "dependency_cycle", ref: null },
      { stageKey: "b", code: "dependency_cycle", ref: null },
    ]);
  });

  it("distinguishes a stage stuck behind the loop from a stage in it", () => {
    const inspection = inspectWorkflow(
      flow(
        { key: "a", dependsOn: ["b"] },
        { key: "b", dependsOn: ["a"] },
        { key: "downstream", dependsOn: ["a"] },
      ),
    );
    expect(inspection.issues).toEqual([
      { stageKey: "a", code: "dependency_cycle", ref: null },
      { stageKey: "b", code: "dependency_cycle", ref: null },
      { stageKey: "downstream", code: "unreachable_stage", ref: null },
    ]);
  });

  it("finds a three-stage loop without walking round it", () => {
    const inspection = inspectWorkflow(
      flow(
        { key: "a", dependsOn: ["c"] },
        { key: "b", dependsOn: ["a"] },
        { key: "c", dependsOn: ["b"] },
      ),
    );
    expect(inspection.issues.filter((entry) => entry.code === "dependency_cycle")).toHaveLength(3);
  });

  it("leaves the sound part of the definition alone", () => {
    const inspection = inspectWorkflow(
      flow({ key: "intake" }, { key: "x", dependsOn: ["y"] }, { key: "y", dependsOn: ["x"] }),
    );
    expect(inspection.issues.map((entry) => entry.stageKey)).toEqual(["x", "y"]);
    expect(inspection.stageCount).toBe(3);
    expect(inspection.approvalGatedStageKeys).toContain("intake");
  });
});

describe("capabilities belong to acting stages", () => {
  it("rejects an automated action that names no capability", () => {
    const inspection = inspectWorkflow(
      flow({ key: "notify", kind: "automated_action", capabilityKey: null }),
    );
    expect(inspection.issues).toContainEqual({
      stageKey: "notify",
      code: "missing_capability",
      ref: null,
    });
  });

  it("rejects a capability hung on a stage that will never invoke it", () => {
    const inspection = inspectWorkflow(
      flow({ key: "tell", kind: "notification", capabilityKey: "comms.send" }),
    );
    expect(inspection.issues).toContainEqual({
      stageKey: "tell",
      code: "capability_on_non_acting_stage",
      ref: "comms.send",
    });
  });

  it("accepts an automated action that names one", () => {
    expect(isPublishableWorkflow(flow(action({ key: "notify" })))).toBe(true);
  });
});

describe("compensation must be declared where it is claimed", () => {
  it("rejects a compensatable stage that names nothing to compensate it", () => {
    const inspection = inspectWorkflow(
      flow(action({ key: "charge", reversibility: "compensatable", compensationKey: null })),
    );
    expect(inspection.issues).toContainEqual({
      stageKey: "charge",
      code: "missing_compensation",
      ref: null,
    });
  });

  it("accepts one that does, and lists it as compensatable", () => {
    const inspection = inspectWorkflow(
      flow(
        action({
          key: "charge",
          reversibility: "compensatable",
          compensationKey: "fees.reverse_charge",
        }),
      ),
    );
    expect(inspection.sound).toBe(true);
    expect(inspection.compensatableStageKeys).toEqual(["charge"]);
  });

  it("does not demand one from an irreversible stage — it lists it instead", () => {
    const inspection = inspectWorkflow(
      flow({ key: "expel", kind: "human_task", reversibility: "irreversible" }),
    );
    expect(inspection.sound).toBe(true);
    expect(inspection.irreversibleStageKeys).toEqual(["expel"]);
  });

  it("holds every kind of stage to the declaration, not just acting ones", () => {
    const inspection = inspectWorkflow(
      flow({ key: "tell", kind: "notification", reversibility: "compensatable" }),
    );
    expect(workflowIssueCodes(inspection)).toEqual(["missing_compensation"]);
  });
});

describe("which stages could ever run unattended", () => {
  it("admits a low-risk reversible automated action", () => {
    expect(isAutoExecutableStage(stage(action({ key: "notify" })))).toBe(true);
  });

  it.each(["medium", "high", "critical"] as const)("refuses a %s-risk action", (riskLevel) => {
    expect(isAutoExecutableStage(stage(action({ key: "notify", riskLevel })))).toBe(false);
  });

  it("refuses an irreversible action however low its risk", () => {
    expect(
      isAutoExecutableStage(stage(action({ key: "notify", reversibility: "irreversible" }))),
    ).toBe(false);
  });

  it("refuses a compensatable action with nothing declared to compensate it", () => {
    expect(
      isAutoExecutableStage(stage(action({ key: "notify", reversibility: "compensatable" }))),
    ).toBe(false);
  });

  it.each(["human_task", "decision", "notification"] as const)(
    "never admits a %s stage, whatever its risk",
    (kind) => {
      expect(isAutoExecutableStage(stage({ key: "s", kind }))).toBe(false);
    },
  );

  it("names the unattended surface of a definition in reading order", () => {
    const inspection = inspectWorkflow(
      flow(
        { key: "review" },
        action({ key: "notify" }),
        action({ key: "escalate", riskLevel: "high" }),
      ),
    );
    expect(inspection.autoExecutableStageKeys).toEqual(["notify"]);
  });
});

describe("which stages always stop for a person", () => {
  it.each(["human_task", "decision"] as const)("includes a %s stage", (kind) => {
    expect(isHumanGatedStage(stage({ key: "s", kind }))).toBe(true);
  });

  it("includes an acting stage that cannot clear the autonomy gate", () => {
    expect(isHumanGatedStage(stage(action({ key: "s", riskLevel: "critical" })))).toBe(true);
  });

  it("excludes an acting stage that can", () => {
    expect(isHumanGatedStage(stage(action({ key: "s" })))).toBe(false);
  });

  it("excludes a notification, which stops for nobody and acts on nothing", () => {
    expect(isHumanGatedStage(stage({ key: "s", kind: "notification" }))).toBe(false);
  });

  it("lists them in reading order", () => {
    const inspection = inspectWorkflow(
      flow(
        action({ key: "notify" }),
        { key: "review", kind: "decision" },
        action({ key: "escalate", riskLevel: "high" }),
        { key: "tell", kind: "notification" },
      ),
    );
    expect(inspection.approvalGatedStageKeys).toEqual(["review", "escalate"]);
  });
});

describe("the worst risk anywhere in a definition", () => {
  it("is the highest of the stages, not the last one read", () => {
    const inspection = inspectWorkflow(
      flow(
        { key: "a", riskLevel: "critical" },
        { key: "b", riskLevel: "low" },
        { key: "c", riskLevel: "medium" },
      ),
    );
    expect(inspection.highestRisk).toBe("critical");
  });

  it("is low when every stage is low", () => {
    expect(inspectWorkflow(flow({ key: "a" }, { key: "b" })).highestRisk).toBe("low");
  });
});

describe("issues are deterministic", () => {
  it("sorts them by code, then by the stage that carries them", () => {
    const inspection = inspectWorkflow(
      flow(
        { key: "z", kind: "automated_action", capabilityKey: null },
        { key: "a", dependsOn: ["ghost"] },
      ),
    );
    expect(inspection.issues).toEqual([
      { stageKey: "z", code: "missing_capability", ref: null },
      { stageKey: "a", code: "unknown_dependency", ref: "ghost" },
      { stageKey: "a", code: "unreachable_stage", ref: null },
    ]);
  });

  it("produces the same inspection for the same definition every time", () => {
    const definition = flow({ key: "a" }, { key: "b", dependsOn: ["a"] });
    expect(inspectWorkflow(definition)).toEqual(inspectWorkflow(definition));
  });
});

describe("execution layers", () => {
  it("puts everything that may start at once in the first layer", () => {
    expect(stageExecutionLayers(flow({ key: "a" }, { key: "b" }))).toEqual([["a", "b"]]);
  });

  it("follows the dependency order rather than the ordinals", () => {
    const layers = stageExecutionLayers([
      stage({ key: "last", ordinal: 1, dependsOn: ["middle"] }),
      stage({ key: "middle", ordinal: 2, dependsOn: ["first"] }),
      stage({ key: "first", ordinal: 3 }),
    ]);
    expect(layers).toEqual([["first"], ["middle"], ["last"]]);
  });

  it("fans out and joins back", () => {
    const layers = stageExecutionLayers(
      flow(
        { key: "intake" },
        { key: "academic", dependsOn: ["intake"] },
        { key: "pastoral", dependsOn: ["intake"] },
        { key: "decide", dependsOn: ["academic", "pastoral"] },
      ),
    );
    expect(layers).toEqual([["intake"], ["academic", "pastoral"], ["decide"]]);
  });

  it("omits stages that can never run", () => {
    expect(
      stageExecutionLayers(
        flow({ key: "a" }, { key: "x", dependsOn: ["y"] }, { key: "y", dependsOn: ["x"] }),
      ),
    ).toEqual([["a"]]);
  });

  it("is empty for a definition with nothing in it", () => {
    expect(stageExecutionLayers([])).toEqual([]);
  });
});

describe("how far an instance has got", () => {
  it("counts each settled status separately and the rest as outstanding", () => {
    const progress = instanceProgress([
      run({ stageKey: "a", status: "completed" }),
      run({ stageKey: "b", status: "skipped" }),
      run({ stageKey: "c", status: "failed" }),
      run({ stageKey: "d", status: "compensated" }),
      run({ stageKey: "e", status: "active" }),
      run({ stageKey: "f", status: "pending" }),
    ]);
    expect(progress).toEqual({
      total: 6,
      completed: 1,
      skipped: 1,
      failed: 1,
      compensated: 1,
      outstanding: 2,
      percentSettled: 66.67,
      complete: false,
    });
  });

  it("is complete when nothing is outstanding", () => {
    const progress = instanceProgress([
      run({ stageKey: "a", status: "completed" }),
      run({ stageKey: "b", status: "skipped" }),
    ]);
    expect(progress.complete).toBe(true);
    expect(progress.percentSettled).toBe(100);
  });

  it("counts a failed instance as settled but not successful — that is the status's job", () => {
    expect(instanceProgress([run({ stageKey: "a", status: "failed" })]).complete).toBe(true);
  });

  it("is not complete when there is nothing in it at all", () => {
    expect(instanceProgress([])).toEqual({
      total: 0,
      completed: 0,
      skipped: 0,
      failed: 0,
      compensated: 0,
      outstanding: 0,
      percentSettled: 0,
      complete: false,
    });
  });
});

describe("what may begin now", () => {
  const definition = flow(
    { key: "intake" },
    { key: "review", dependsOn: ["intake"] },
    { key: "notify", dependsOn: ["intake"] },
    { key: "close", dependsOn: ["review", "notify"] },
  );

  it("starts with the stages that depend on nothing", () => {
    const runs = definition.map((s) => run({ stageKey: s.key }));
    expect(readyStageKeys(definition, runs)).toEqual(["intake"]);
  });

  it("releases both branches when their shared dependency completes", () => {
    const runs = [
      run({ stageKey: "intake", status: "completed" }),
      run({ stageKey: "review" }),
      run({ stageKey: "notify" }),
      run({ stageKey: "close" }),
    ];
    expect(readyStageKeys(definition, runs)).toEqual(["review", "notify"]);
  });

  it("treats a skipped dependency as satisfied", () => {
    const runs = [
      run({ stageKey: "intake", status: "skipped" }),
      run({ stageKey: "review" }),
      run({ stageKey: "notify" }),
      run({ stageKey: "close" }),
    ];
    expect(readyStageKeys(definition, runs)).toContain("review");
  });

  it("releases nothing behind a failed dependency", () => {
    const runs = [
      run({ stageKey: "intake", status: "failed" }),
      run({ stageKey: "review" }),
      run({ stageKey: "notify" }),
      run({ stageKey: "close" }),
    ];
    expect(readyStageKeys(definition, runs)).toEqual([]);
  });

  it("waits for every dependency of a join, not just one", () => {
    const runs = [
      run({ stageKey: "intake", status: "completed" }),
      run({ stageKey: "review", status: "completed" }),
      run({ stageKey: "notify", status: "active" }),
      run({ stageKey: "close" }),
    ];
    expect(readyStageKeys(definition, runs)).toEqual([]);
  });

  it("does not re-release a stage that has already started", () => {
    const runs = [
      run({ stageKey: "intake", status: "active" }),
      run({ stageKey: "review" }),
      run({ stageKey: "notify" }),
      run({ stageKey: "close" }),
    ];
    expect(readyStageKeys(definition, runs)).toEqual([]);
  });

  it("is empty when the instance has no runs at all", () => {
    expect(readyStageKeys(definition, [])).toEqual([]);
  });
});

describe("stages that have run past their SLA", () => {
  const definition = flow(
    { key: "review", slaHours: 24 },
    { key: "escalate", slaHours: 4 },
    { key: "untimed" },
  );
  const asOf = "2026-03-02T12:00:00.000Z";

  it("reports whole hours beyond the SLA", () => {
    const runs = [
      run({ stageKey: "review", status: "active", startedAt: "2026-03-01T08:00:00.000Z" }),
    ];
    expect(overdueStages(definition, runs, asOf)).toEqual([
      { stageKey: "review", slaHours: 24, overdueByHours: 4 },
    ]);
  });

  it("says nothing about a stage still inside its SLA", () => {
    const runs = [
      run({ stageKey: "review", status: "active", startedAt: "2026-03-02T00:00:00.000Z" }),
    ];
    expect(overdueStages(definition, runs, asOf)).toEqual([]);
  });

  it("ignores a stage that has not started and one that has finished", () => {
    const runs = [
      run({ stageKey: "review", status: "pending" }),
      run({
        stageKey: "escalate",
        status: "completed",
        startedAt: "2026-03-01T00:00:00.000Z",
        settledAt: "2026-03-01T01:00:00.000Z",
      }),
    ];
    expect(overdueStages(definition, runs, asOf)).toEqual([]);
  });

  it("ignores a stage that carries no SLA at all", () => {
    const runs = [
      run({ stageKey: "untimed", status: "active", startedAt: "2020-01-01T00:00:00.000Z" }),
    ];
    expect(overdueStages(definition, runs, asOf)).toEqual([]);
  });

  it("puts the worst breach first", () => {
    const runs = [
      run({ stageKey: "review", status: "active", startedAt: "2026-03-01T08:00:00.000Z" }),
      run({ stageKey: "escalate", status: "active", startedAt: "2026-03-01T08:00:00.000Z" }),
    ];
    expect(overdueStages(definition, runs, asOf).map((entry) => entry.stageKey)).toEqual([
      "escalate",
      "review",
    ]);
  });

  it("gives the same answer for the same moment however often it is asked", () => {
    const runs = [
      run({ stageKey: "review", status: "active", startedAt: "2026-03-01T08:00:00.000Z" }),
    ];
    expect(overdueStages(definition, runs, asOf)).toEqual(overdueStages(definition, runs, asOf));
  });

  it("reports nothing rather than guessing when the moment is unreadable", () => {
    const runs = [
      run({ stageKey: "review", status: "active", startedAt: "2026-03-01T08:00:00.000Z" }),
    ];
    expect(overdueStages(definition, runs, "not-a-date")).toEqual([]);
  });

  it("ignores a run whose start is unreadable", () => {
    const runs = [run({ stageKey: "review", status: "active", startedAt: "whenever" })];
    expect(overdueStages(definition, runs, asOf)).toEqual([]);
  });
});
