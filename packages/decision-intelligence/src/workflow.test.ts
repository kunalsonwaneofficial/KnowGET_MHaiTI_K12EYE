import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  DuplicateStageKeyError,
  EmptyStageKeyError,
  EmptyStageNameError,
  EmptyWorkflowKeyError,
  EmptyWorkflowNameError,
  InvalidWorkflowTransitionError,
  PublishedWorkflowImmutableError,
  StageNotFoundError,
  UnsoundWorkflowError,
  WorkflowTriggerSignalMissingError,
  WorkflowTriggerSignalNotAllowedError,
} from "./errors";
import type {
  CreateWorkflowParams,
  DefineStageParams,
  WorkflowDefinition,
  WorkflowStage,
} from "./workflow";
import {
  addStage,
  amendWorkflow,
  canStartWorkflowInstance,
  createWorkflow,
  defineStage,
  inspectWorkflowDefinition,
  isWorkflowEditable,
  isWorkflowSound,
  publishWorkflow,
  removeStage,
  replaceStages,
  resumeWorkflow,
  retireWorkflow,
  reviseWorkflow,
  suspendWorkflow,
  toWorkflowStageViews,
  workflowStage,
  workflowStageKeys,
} from "./workflow";

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

const draft = (patch: Partial<CreateWorkflowParams> = {}): WorkflowDefinition =>
  createWorkflow({
    tenantId: TENANT,
    organizationId: ORG,
    key: "attendance-intervention",
    name: "Attendance intervention",
    trigger: "manual",
    stages: [stage()],
    ...patch,
  });

const published = (patch: Partial<CreateWorkflowParams> = {}): WorkflowDefinition =>
  publishWorkflow(draft(patch), { publishedByUserId: "user-1" });

describe("defining a stage", () => {
  it("normalizes the stage key to the shared registry grammar", () => {
    expect(stage({ key: "  Notify-Guardian  " }).key).toBe("notify-guardian");
  });

  it("normalizes the capability and compensation keys the same way", () => {
    const acting = stage({
      kind: "automated_action",
      capabilityKey: " Attendance.Flag_At_Risk ",
      reversibility: "compensatable",
      compensationKey: " Attendance.Clear_Flag ",
    });

    expect(acting.capabilityKey).toBe("attendance.flag_at_risk");
    expect(acting.compensationKey).toBe("attendance.clear_flag");
  });

  it("treats a blank capability key as no capability at all", () => {
    expect(stage({ capabilityKey: "   " }).capabilityKey).toBeNull();
  });

  it("de-duplicates and normalizes the stages it depends on", () => {
    expect(stage({ dependsOn: [" Intake ", "intake", "triage", "  "] }).dependsOn).toEqual([
      "intake",
      "triage",
    ]);
  });

  it("defaults a stage to required, unassigned and without an SLA", () => {
    const defined = stage();

    expect(defined.optional).toBe(false);
    expect(defined.assigneeRole).toBeNull();
    expect(defined.slaHours).toBeNull();
  });

  it("refuses a stage with no key", () => {
    expect(() => stage({ key: "   " })).toThrow(EmptyStageKeyError);
  });

  it("refuses a stage with no name", () => {
    expect(() => stage({ name: "   " })).toThrow(EmptyStageNameError);
  });
});

describe("drafting a workflow definition", () => {
  it("normalizes the workflow key and starts at version one", () => {
    const workflow = draft({ key: "  Attendance-Intervention  " });

    expect(workflow.key).toBe("attendance-intervention");
    expect(workflow.version).toBe(1);
  });

  it("starts every definition as an unpublished draft", () => {
    const workflow = draft();

    expect(workflow.status).toBe("draft");
    expect(workflow.publishedAt).toBeNull();
    expect(workflow.publishedByUserId).toBeNull();
    expect(isWorkflowEditable(workflow)).toBe(true);
    expect(canStartWorkflowInstance(workflow)).toBe(false);
  });

  it("refuses a definition with no key", () => {
    expect(() => draft({ key: "  " })).toThrow(EmptyWorkflowKeyError);
  });

  it("refuses a definition with no name", () => {
    expect(() => draft({ name: "  " })).toThrow(EmptyWorkflowNameError);
  });

  it("refuses two stages answering to one key", () => {
    let thrown: unknown;
    try {
      draft({ stages: [stage(), stage({ name: "A second review" })] });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DuplicateStageKeyError);
    expect((thrown as DuplicateStageKeyError).details).toEqual({ stageKey: "review" });
  });
});

describe("what starts a workflow", () => {
  it("requires a signal-triggered workflow to name its signal", () => {
    expect(() => draft({ trigger: "signal" })).toThrow(WorkflowTriggerSignalMissingError);
  });

  it("normalizes the signal key to the shared registry grammar", () => {
    const workflow = draft({ trigger: "signal", triggerSignalKey: " Attendance.Streak_Broken " });

    expect(workflow.triggerSignalKey).toBe("attendance.streak_broken");
  });

  it("refuses a manual workflow that also names a signal", () => {
    let thrown: unknown;
    try {
      draft({ trigger: "manual", triggerSignalKey: "attendance.streak_broken" });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(WorkflowTriggerSignalNotAllowedError);
    expect((thrown as WorkflowTriggerSignalNotAllowedError).details).toEqual({
      trigger: "manual",
    });
  });

  it("refuses an automation-triggered workflow that also names a signal", () => {
    expect(() =>
      draft({ trigger: "automation", triggerSignalKey: "attendance.streak_broken" }),
    ).toThrow(WorkflowTriggerSignalNotAllowedError);
  });

  it("re-checks the trigger when a draft changes what starts it", () => {
    expect(() => amendWorkflow(draft(), { trigger: "signal" })).toThrow(
      WorkflowTriggerSignalMissingError,
    );
  });

  it("accepts a coherent change of trigger", () => {
    const amended = amendWorkflow(draft(), {
      trigger: "signal",
      triggerSignalKey: "attendance.streak_broken",
    });

    expect(amended.trigger).toBe("signal");
    expect(amended.triggerSignalKey).toBe("attendance.streak_broken");
  });
});

describe("editing a draft", () => {
  it("adds a stage", () => {
    const workflow = addStage(draft(), {
      key: "notify",
      name: "Notify the guardian",
      ordinal: 2,
      kind: "notification",
      riskLevel: "low",
      reversibility: "reversible",
      dependsOn: ["review"],
    });

    expect(workflowStageKeys(workflow)).toEqual(["review", "notify"]);
  });

  it("refuses to add a stage whose key is already taken", () => {
    expect(() =>
      addStage(draft(), {
        key: "review",
        name: "Another review",
        ordinal: 2,
        kind: "human_task",
        riskLevel: "low",
        reversibility: "reversible",
      }),
    ).toThrow(DuplicateStageKeyError);
  });

  it("amends what the workflow is called and what it is for", () => {
    const amended = amendWorkflow(draft(), {
      name: "  Attendance intervention (revised)  ",
      description: "  Runs when a learner's attendance falls below the threshold.  ",
    });

    expect(amended.name).toBe("Attendance intervention (revised)");
    expect(amended.description).toBe("Runs when a learner's attendance falls below the threshold.");
  });

  it("refuses to amend a name away to nothing", () => {
    expect(() => amendWorkflow(draft(), { name: "   " })).toThrow(EmptyWorkflowNameError);
  });

  it("removes a stage", () => {
    const workflow = removeStage(draft(), "review");

    expect(workflow.stages).toEqual([]);
  });

  it("leaves a dependency on a removed stage dangling rather than rewiring the rest", () => {
    const withNotify = addStage(draft(), {
      key: "notify",
      name: "Notify the guardian",
      ordinal: 2,
      kind: "notification",
      riskLevel: "low",
      reversibility: "reversible",
      dependsOn: ["review"],
    });

    const workflow = removeStage(withNotify, "review");

    expect(workflowStage(workflow, "notify")?.dependsOn).toEqual(["review"]);
    expect(inspectWorkflowDefinition(workflow).issues).toContainEqual({
      stageKey: "notify",
      code: "unknown_dependency",
      ref: "review",
    });
  });

  it("refuses to remove a stage that is not there", () => {
    let thrown: unknown;
    try {
      removeStage(draft(), "nope");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(StageNotFoundError);
    expect((thrown as StageNotFoundError).details).toMatchObject({ stageKey: "nope" });
  });

  it("replaces the whole set of stages, as a definition editor saves them", () => {
    const workflow = replaceStages(draft(), [
      stage({ key: "intake", name: "Intake", ordinal: 1 }),
      stage({ key: "triage", name: "Triage", ordinal: 2, dependsOn: ["intake"] }),
    ]);

    expect(workflowStageKeys(workflow)).toEqual(["intake", "triage"]);
  });

  it("refuses a wholesale replacement carrying a duplicate key", () => {
    expect(() => replaceStages(draft(), [stage(), stage()])).toThrow(DuplicateStageKeyError);
  });

  it("stamps the moment of every edit", () => {
    const workflow = draft();
    const amended = amendWorkflow(workflow, { description: "why" });

    expect(Date.parse(amended.updatedAt)).toBeGreaterThanOrEqual(Date.parse(workflow.updatedAt));
  });
});

describe("a published version is frozen", () => {
  it("refuses to add a stage", () => {
    let thrown: unknown;
    try {
      addStage(published(), {
        key: "notify",
        name: "Notify",
        ordinal: 2,
        kind: "notification",
        riskLevel: "low",
        reversibility: "reversible",
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(PublishedWorkflowImmutableError);
    expect((thrown as PublishedWorkflowImmutableError).details).toMatchObject({
      status: "published",
    });
  });

  it("refuses to remove a stage", () => {
    expect(() => removeStage(published(), "review")).toThrow(PublishedWorkflowImmutableError);
  });

  it("refuses to replace the stages", () => {
    expect(() => replaceStages(published(), [])).toThrow(PublishedWorkflowImmutableError);
  });

  it("refuses to amend what it is called", () => {
    expect(() => amendWorkflow(published(), { name: "Renamed" })).toThrow(
      PublishedWorkflowImmutableError,
    );
  });

  it("refuses edits to a suspended version too, not only a published one", () => {
    expect(() => amendWorkflow(suspendWorkflow(published()), { name: "Renamed" })).toThrow(
      PublishedWorkflowImmutableError,
    );
  });

  it("refuses edits to a retired version", () => {
    expect(() => amendWorkflow(retireWorkflow(draft()), { name: "Renamed" })).toThrow(
      PublishedWorkflowImmutableError,
    );
  });
});

describe("publication is the gate", () => {
  it("publishes a sound definition and names who published it", () => {
    const workflow = published();

    expect(workflow.status).toBe("published");
    expect(workflow.publishedByUserId).toBe("user-1");
    expect(workflow.publishedAt).not.toBeNull();
    expect(canStartWorkflowInstance(workflow)).toBe(true);
    expect(isWorkflowEditable(workflow)).toBe(false);
  });

  it("refuses to publish an empty definition", () => {
    let thrown: unknown;
    try {
      publishWorkflow(draft({ stages: [] }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnsoundWorkflowError);
    expect((thrown as UnsoundWorkflowError).details).toMatchObject({
      issues: ["empty_workflow"],
    });
  });

  it("refuses to publish a definition whose stages depend on each other in a loop", () => {
    const tangled = draft({
      stages: [
        stage({ key: "a", name: "A", ordinal: 1, dependsOn: ["b"] }),
        stage({ key: "b", name: "B", ordinal: 2, dependsOn: ["a"] }),
      ],
    });

    let thrown: unknown;
    try {
      publishWorkflow(tangled);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnsoundWorkflowError);
    expect((thrown as UnsoundWorkflowError).details).toMatchObject({
      issues: ["dependency_cycle"],
    });
  });

  it("refuses to publish an acting stage that names no capability", () => {
    const workflow = draft({
      stages: [stage({ kind: "automated_action", capabilityKey: null })],
    });

    expect(() => publishWorkflow(workflow)).toThrow(UnsoundWorkflowError);
  });

  it("refuses to publish a compensatable stage that names no way back", () => {
    const workflow = draft({
      stages: [
        stage({
          kind: "automated_action",
          capabilityKey: "attendance.flag_at_risk",
          reversibility: "compensatable",
          compensationKey: null,
        }),
      ],
    });

    let thrown: unknown;
    try {
      publishWorkflow(workflow);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnsoundWorkflowError);
    expect((thrown as UnsoundWorkflowError).details).toMatchObject({
      issues: ["missing_compensation"],
    });
  });

  it("reports soundness before anyone tries to publish", () => {
    expect(isWorkflowSound(draft())).toBe(true);
    expect(isWorkflowSound(draft({ stages: [] }))).toBe(false);
  });

  it("refuses to publish anything that is not a draft", () => {
    let thrown: unknown;
    try {
      publishWorkflow(published());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidWorkflowTransitionError);
    expect((thrown as InvalidWorkflowTransitionError).details).toEqual({
      from: "published",
      to: "published",
    });
  });
});

describe("suspending, resuming and retiring", () => {
  it("suspends a published version, closing it to new cases", () => {
    const workflow = suspendWorkflow(published());

    expect(workflow.status).toBe("suspended");
    expect(canStartWorkflowInstance(workflow)).toBe(false);
  });

  it("resumes a suspended version", () => {
    expect(resumeWorkflow(suspendWorkflow(published())).status).toBe("published");
  });

  it("refuses to suspend something that was never published", () => {
    expect(() => suspendWorkflow(draft())).toThrow(InvalidWorkflowTransitionError);
  });

  it("refuses to resume something that was not suspended", () => {
    expect(() => resumeWorkflow(published())).toThrow(InvalidWorkflowTransitionError);
  });

  it("retires a draft that never went live", () => {
    const workflow = retireWorkflow(draft());

    expect(workflow.status).toBe("retired");
    expect(workflow.retiredAt).not.toBeNull();
  });

  it("retires a published version", () => {
    expect(retireWorkflow(published()).status).toBe("retired");
  });

  it("refuses to retire a version twice, because retirement is not a state to re-enter", () => {
    expect(() => retireWorkflow(retireWorkflow(draft()))).toThrow(InvalidWorkflowTransitionError);
  });
});

describe("revising a published process", () => {
  it("produces a fresh draft at the next version, carrying the same key and stages", () => {
    const live = published();
    const revision = reviseWorkflow(live);

    expect(revision.key).toBe(live.key);
    expect(revision.version).toBe(2);
    expect(revision.status).toBe("draft");
    expect(workflowStageKeys(revision)).toEqual(workflowStageKeys(live));
  });

  it("gives the revision its own identity rather than shadowing the version it came from", () => {
    const live = published();
    const revision = reviseWorkflow(live);

    expect(revision.id).not.toBe(live.id);
    expect(revision.publishedAt).toBeNull();
  });

  it("leaves the published version it came from untouched, so live cases keep their meaning", () => {
    const live = published();
    const revision = addStage(reviseWorkflow(live), {
      key: "escalate",
      name: "Escalate",
      ordinal: 2,
      kind: "human_task",
      riskLevel: "medium",
      reversibility: "reversible",
    });

    expect(workflowStageKeys(revision)).toEqual(["review", "escalate"]);
    expect(workflowStageKeys(live)).toEqual(["review"]);
  });

  it("carries the trigger and its signal across to the revision", () => {
    const live = publishWorkflow(
      draft({ trigger: "signal", triggerSignalKey: "attendance.streak_broken" }),
    );
    const revision = reviseWorkflow(live);

    expect(revision.trigger).toBe("signal");
    expect(revision.triggerSignalKey).toBe("attendance.streak_broken");
  });

  it("records who raised the revision, falling back to whoever created the original", () => {
    const live = publishWorkflow(draft({ createdByUserId: "user-1" }));

    expect(reviseWorkflow(live).createdByUserId).toBe("user-1");
    expect(reviseWorkflow(live, { createdByUserId: "user-2" }).createdByUserId).toBe("user-2");
  });
});

describe("what the engines are given to read", () => {
  it("hands the orchestration engine the stages themselves", () => {
    const workflow = draft();

    expect(toWorkflowStageViews(workflow)).toEqual(workflow.stages);
  });

  it("reports what the publication gate would say, without publishing anything", () => {
    const inspection = inspectWorkflowDefinition(
      draft({ stages: [stage({ dependsOn: ["missing"] })] }),
    );

    expect(inspection.sound).toBe(false);
    expect(inspection.issues.map((entry) => entry.code)).toEqual([
      "unknown_dependency",
      "unreachable_stage",
    ]);
  });

  it("looks a stage up by key, normalizing the way in", () => {
    expect(workflowStage(draft(), "  REVIEW  ")?.name).toBe("Pastoral review");
    expect(workflowStage(draft(), "nope")).toBeNull();
  });

  it("lists stage keys in reading order rather than insertion order", () => {
    const workflow = draft({
      stages: [
        stage({ key: "third", name: "Third", ordinal: 3 }),
        stage({ key: "first", name: "First", ordinal: 1 }),
        stage({ key: "second", name: "Second", ordinal: 2 }),
      ],
    });

    expect(workflowStageKeys(workflow)).toEqual(["first", "second", "third"]);
  });
});
