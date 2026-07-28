import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  AnonymousWorkflowActionError,
  CapabilityNotInvocableError,
  InvalidStageTransitionError,
  RequiredStageNotSkippableError,
  StageDependenciesUnsettledError,
  StageNotFoundError,
  StageRunNotFoundError,
  WorkflowInstanceNotFoundError,
  WorkflowNotFoundError,
} from "./errors";
import { InMemoryWorkflowInstanceRepository, InMemoryWorkflowRepository } from "./ports";
import {
  type CreateWorkflowParams,
  type DefineStageParams,
  type WorkflowDefinition,
  type WorkflowStage,
  createWorkflow,
  defineStage,
  publishWorkflow,
} from "./workflow";
import type { WorkflowInstance } from "./workflow-instance";
import { WorkflowRunService } from "./workflow-run-service";

const TENANT = "tenant-1" as TenantId;
const OTHER = "tenant-2" as TenantId;
const ORG = "org-1" as Uuid;

const NOTIFY = "attendance.notify-guardian";
const RETRACT = "attendance.retract-notice";

const REVIEW = "review";
const NOTIFY_STAGE = "notify";
const LOG_STAGE = "log-outcome";

const LONG_AFTER = "2099-01-01T00:00:00.000Z" as ISODateString;
const LONG_BEFORE = "2020-01-01T00:00:00.000Z" as ISODateString;

/** A person's stage, carrying the SLA the operations screen watches. */
const reviewStage = (patch: Partial<DefineStageParams> = {}): WorkflowStage =>
  defineStage({
    key: REVIEW,
    name: "Pastoral review",
    ordinal: 1,
    kind: "human_task",
    riskLevel: "low",
    reversibility: "reversible",
    assigneeRole: "class-teacher",
    slaHours: 24,
    ...patch,
  });

/** The runtime's stage, declaring both what it calls and what puts it back. */
const notifyStage = (patch: Partial<DefineStageParams> = {}): WorkflowStage =>
  defineStage({
    key: NOTIFY_STAGE,
    name: "Notify the guardian",
    ordinal: 2,
    kind: "automated_action",
    capabilityKey: NOTIFY,
    riskLevel: "low",
    reversibility: "compensatable",
    compensationKey: RETRACT,
    dependsOn: [REVIEW],
    ...patch,
  });

/** A stage the definition says may be passed over. */
const logStage = (patch: Partial<DefineStageParams> = {}): WorkflowStage =>
  defineStage({
    key: LOG_STAGE,
    name: "Log the outcome",
    ordinal: 3,
    kind: "human_task",
    riskLevel: "low",
    reversibility: "reversible",
    optional: true,
    dependsOn: [NOTIFY_STAGE],
    ...patch,
  });

describe("WorkflowRunService", () => {
  let repository: InMemoryWorkflowInstanceRepository;
  let workflows: InMemoryWorkflowRepository;
  let unreachable: Set<string>;
  let published: DomainEvent[];
  let svc: WorkflowRunService;

  beforeEach(() => {
    repository = new InMemoryWorkflowInstanceRepository();
    workflows = new InMemoryWorkflowRepository();
    unreachable = new Set<string>();
    published = [];
    svc = new WorkflowRunService({
      repository,
      workflows,
      capabilities: {
        async isInvocable(_tenantId: TenantId, capabilityKey: string): Promise<boolean> {
          return !unreachable.has(capabilityKey);
        },
      },
      events: {
        async publish(event: DomainEvent): Promise<void> {
          published.push(event);
        },
      },
    });
  });

  const define = (patch: Partial<CreateWorkflowParams> = {}): WorkflowDefinition =>
    createWorkflow({
      tenantId: TENANT,
      organizationId: ORG,
      key: "attendance-intervention",
      name: "Attendance intervention",
      trigger: "manual",
      stages: [reviewStage(), notifyStage(), logStage()],
      ...patch,
    });

  /** A published version, in the store, ready to carry cases. */
  const install = async (
    patch: Partial<CreateWorkflowParams> = {},
  ): Promise<WorkflowDefinition> => {
    const workflow = publishWorkflow(define(patch), { publishedByUserId: "user-1" });
    await workflows.save(workflow);
    return workflow;
  };

  const begin = async (patch: Partial<CreateWorkflowParams> = {}): Promise<WorkflowInstance> => {
    const workflow = await install(patch);
    return svc.start(workflow.tenantId, workflow.key, {
      subjectDomain: "attendance",
      subjectId: "student-4471",
      triggeredByUserId: "user-6602",
    });
  };

  /** Pick a stage up and put it down again — the two moves every stage but a skipped one makes. */
  const carry = async (id: Uuid, stageKey: string): Promise<WorkflowInstance> => {
    await svc.beginStage(TENANT, id, stageKey, { assignedToUserId: "user-6602" });
    return svc.completeStage(TENANT, id, stageKey, { note: "done" });
  };

  const types = (): readonly string[] => published.map((event) => event.type);

  const statusOf = (instance: WorkflowInstance, stageKey: string): string | undefined =>
    instance.stageRuns.find((run) => run.stageKey === stageKey)?.status;

  // --- Starting --------------------------------------------------------------------

  it("starts a case under whatever version is published, snapshotting the process it ran", async () => {
    const workflow = await install();

    const instance = await svc.start(TENANT, workflow.key, {
      subjectDomain: "  Attendance  ",
      subjectId: "student-4471",
      triggeredByUserId: "user-6602",
    });

    expect(instance.status).toBe("running");
    expect(instance.workflowId).toBe(workflow.id);
    expect(instance.workflowKey).toBe(workflow.key);
    expect(instance.workflowVersion).toBe(1);
    expect(instance.subjectDomain).toBe("attendance");
    expect(instance.stageRuns.map((run) => run.status)).toEqual(["pending", "pending", "pending"]);
    expect(types()).toEqual(["decision.workflow_instance.started"]);
  });

  /**
   * A key with no published version is a 404 on the key, which is the truthful answer: as far as anyone trying
   * to run this process is concerned, it does not exist. A draft is not a lesser version of it.
   */
  it("refuses to run a process that has only ever been drafted", async () => {
    await workflows.save(define());

    await expect(
      svc.start(TENANT, "attendance-intervention", {
        subjectDomain: "attendance",
        subjectId: "student-4471",
        triggeredByUserId: "user-6602",
      }),
    ).rejects.toThrow(WorkflowNotFoundError);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
  });

  it("starts under the published version even once a later draft exists", async () => {
    const workflow = await install();
    await workflows.save(define({ version: 2 }));

    const instance = await svc.start(TENANT, workflow.key, {
      subjectDomain: "attendance",
      subjectId: "student-4471",
      triggeredByUserId: "user-6602",
    });

    expect(instance.workflowVersion).toBe(1);
  });

  it("refuses a hand-started case nobody started", async () => {
    const workflow = await install();

    await expect(
      svc.start(TENANT, workflow.key, {
        subjectDomain: "attendance",
        subjectId: "student-4471",
      }),
    ).rejects.toThrow(AnonymousWorkflowActionError);
  });

  // --- Stages ----------------------------------------------------------------------

  it("refuses to pick up a stage whose dependencies have not settled", async () => {
    const instance = await begin();

    await expect(svc.beginStage(TENANT, instance.id, NOTIFY_STAGE)).rejects.toThrow(
      StageDependenciesUnsettledError,
    );
  });

  /**
   * The instance settles itself the moment nothing is outstanding, so the transition that finishes the last
   * stage also finishes the case. Both are announced: a listener watching stages would otherwise never learn a
   * case ended, and one watching cases would never learn which ending it was.
   */
  it("carries a case to its end, announcing the stage and the ending both", async () => {
    const instance = await begin();

    await carry(instance.id, REVIEW);
    await carry(instance.id, NOTIFY_STAGE);
    const settled = await svc.skipStage(TENANT, instance.id, LOG_STAGE, { note: "not needed" });

    expect(settled.status).toBe("completed");
    expect(settled.settledAt).not.toBeNull();
    expect(types()).toEqual([
      "decision.workflow_instance.started",
      "decision.workflow_instance.stage_begun",
      "decision.workflow_instance.stage_completed",
      "decision.workflow_instance.stage_begun",
      "decision.workflow_instance.stage_completed",
      "decision.workflow_instance.stage_skipped",
      "decision.workflow_instance.completed",
    ]);
  });

  it("says nothing about the case when the stage move did not end it", async () => {
    const instance = await begin();

    await svc.beginStage(TENANT, instance.id, REVIEW);

    expect(types()).toEqual([
      "decision.workflow_instance.started",
      "decision.workflow_instance.stage_begun",
    ]);
  });

  it("refuses to pass over a stage the definition required", async () => {
    const instance = await begin();

    await expect(svc.skipStage(TENANT, instance.id, REVIEW)).rejects.toThrow(
      RequiredStageNotSkippableError,
    );
  });

  /** The case stops at the stage that did not work rather than finishing around the hole. */
  it("stops the case at the stage that failed, and records which one and why", async () => {
    const instance = await begin();
    await svc.beginStage(TENANT, instance.id, REVIEW);

    const failed = await svc.failStage(TENANT, instance.id, REVIEW, {
      error: "guardian contact details missing",
    });

    expect(failed.status).toBe("failed");
    expect(failed.failureStageKey).toBe(REVIEW);
    expect(failed.failureError).toBe("guardian contact details missing");
    expect(statusOf(failed, NOTIFY_STAGE)).toBe("pending");
    expect(types().slice(-2)).toEqual([
      "decision.workflow_instance.stage_failed",
      "decision.workflow_instance.failed",
    ]);
  });

  it("404s on a stage this case does not carry", async () => {
    const instance = await begin();

    await expect(svc.beginStage(TENANT, instance.id, "nowhere")).rejects.toThrow(
      StageRunNotFoundError,
    );
  });

  // --- Putting it back -------------------------------------------------------------

  /**
   * Rule three at the moment of use. The compensating capability comes from the definition rather than the case,
   * and is checked before anything is written — a reversal recorded against a capability nobody can call leaves
   * the institution believing something was undone that was not. The case being over is no obstacle: undoing
   * what a finished case did necessarily happens afterwards.
   */
  it("checks the declared way back when the reversal is claimed, and outlives the case", async () => {
    const instance = await begin();
    await carry(instance.id, REVIEW);
    await carry(instance.id, NOTIFY_STAGE);
    await svc.skipStage(TENANT, instance.id, LOG_STAGE);
    published = [];

    unreachable.add(RETRACT);
    await expect(svc.compensateStage(TENANT, instance.id, NOTIFY_STAGE)).rejects.toThrow(
      CapabilityNotInvocableError,
    );

    unreachable.delete(RETRACT);
    const compensated = await svc.compensateStage(TENANT, instance.id, NOTIFY_STAGE);

    expect(compensated.status).toBe("completed");
    expect(statusOf(compensated, NOTIFY_STAGE)).toBe("compensated");
    expect(types()).toEqual(["decision.workflow_instance.stage_compensated"]);
  });

  it("refuses to put back a stage that never ran", async () => {
    const instance = await begin();

    await expect(svc.compensateStage(TENANT, instance.id, NOTIFY_STAGE)).rejects.toThrow(
      InvalidStageTransitionError,
    );
  });

  it("refuses to put back a stage the definition never had", async () => {
    const instance = await begin();

    await expect(svc.compensateStage(TENANT, instance.id, "nowhere")).rejects.toThrow(
      StageNotFoundError,
    );
  });

  // --- Stopping early --------------------------------------------------------------

  it("stops a case early, naming who stopped it and leaving what was done findable", async () => {
    const instance = await begin();
    await carry(instance.id, REVIEW);

    const cancelled = await svc.cancel(TENANT, instance.id, {
      cancelledByUserId: "user-7710",
      reason: "  Guardian contacted the school first  ",
    });

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelledByUserId).toBe("user-7710");
    expect(cancelled.cancellationReason).toBe("Guardian contacted the school first");
    expect(statusOf(cancelled, REVIEW)).toBe("completed");
    expect(statusOf(cancelled, NOTIFY_STAGE)).toBe("skipped");
    expect(types()).toContain("decision.workflow_instance.cancelled");
  });

  it("refuses a cancellation with nobody behind it", async () => {
    const instance = await begin();

    await expect(svc.cancel(TENANT, instance.id, { cancelledByUserId: "   " })).rejects.toThrow(
      AnonymousWorkflowActionError,
    );
  });

  // --- Reading ---------------------------------------------------------------------

  it("says which stages could be picked up right now", async () => {
    const instance = await begin();

    expect(await svc.ready(TENANT, instance.id)).toEqual([REVIEW]);
    await carry(instance.id, REVIEW);
    expect(await svc.ready(TENANT, instance.id)).toEqual([NOTIFY_STAGE]);
  });

  it("says which stages have run past the time the definition allowed them", async () => {
    const instance = await begin();
    await svc.beginStage(TENANT, instance.id, REVIEW);

    const overdue = await svc.overdue(TENANT, instance.id, LONG_AFTER);

    expect(overdue.map((stage) => stage.stageKey)).toEqual([REVIEW]);
    expect(overdue[0]?.slaHours).toBe(24);
    expect(await svc.overdue(TENANT, instance.id, LONG_BEFORE)).toEqual([]);
  });

  /**
   * The question anyone stopping a case halfway needs answered before they stop it — including the honest half,
   * which is what cannot be undone at all.
   */
  it("plans the way back, and says plainly what has no way back", async () => {
    const instance = await begin();
    await carry(instance.id, REVIEW);
    await carry(instance.id, NOTIFY_STAGE);

    const plan = await svc.reversalPlan(TENANT, instance.id);

    expect(plan.steps.map((step) => step.stageKey)).toEqual([NOTIFY_STAGE]);
    expect(plan.steps[0]?.compensationKey).toBe(RETRACT);
    expect(plan.fullyReversible).toBe(true);
  });

  it("counts an irreversible stage against the plan rather than around it", async () => {
    const workflow = await install({
      key: "fees-write-off",
      name: "Fees write-off",
      stages: [
        reviewStage({ key: "approve", name: "Approve the write-off" }),
        notifyStage({
          key: "post",
          name: "Post the write-off",
          capabilityKey: "fees.post-write-off",
          riskLevel: "high",
          reversibility: "irreversible",
          compensationKey: null,
          dependsOn: ["approve"],
        }),
      ],
    });
    const instance = await svc.start(TENANT, workflow.key, {
      subjectDomain: "fees",
      subjectId: "invoice-99",
      triggeredByUserId: "user-6602",
    });
    await carry(instance.id, "approve");
    await carry(instance.id, "post");

    const plan = await svc.reversalPlan(TENANT, instance.id);

    expect(plan.steps).toEqual([]);
    expect(plan.irreversibleStageKeys).toEqual(["post"]);
    expect(plan.fullyReversible).toBe(false);
    expect(plan.reversibleShare).toBe(50);
  });

  it("lists cases by version, by subject, by whether they are still moving, and by tenant", async () => {
    const mine = await begin();
    const otherTenant = await begin({ tenantId: OTHER });
    const finished = await begin({ key: "attendance-review", name: "Attendance review" });
    await carry(finished.id, REVIEW);
    await carry(finished.id, NOTIFY_STAGE);
    await svc.skipStage(TENANT, finished.id, LOG_STAGE);

    expect((await svc.listByWorkflow(TENANT, mine.workflowId)).map((i) => i.id)).toEqual([mine.id]);
    expect(await svc.listBySubject(TENANT, "attendance", "student-4471")).toHaveLength(2);
    expect((await svc.listRunning(TENANT)).map((i) => i.id)).toEqual([mine.id]);
    expect(await svc.list(TENANT)).toHaveLength(2);
    expect((await svc.list(OTHER)).map((i) => i.id)).toEqual([otherTenant.id]);
  });

  it("reads only inside the tenant asked about", async () => {
    const mine = await begin();

    await expect(svc.get(OTHER, mine.id)).rejects.toThrow(WorkflowInstanceNotFoundError);
  });

  it("404s on a case that is not there", async () => {
    await expect(svc.get(TENANT, "nobody-1" as Uuid)).rejects.toThrow(
      WorkflowInstanceNotFoundError,
    );
  });

  /** Every read that compares a case against its process needs both; the missing half is named, not guessed at. */
  it("404s when the version a case was running under has gone", async () => {
    const instance = await begin();
    await workflows.remove(TENANT, instance.workflowId);

    await expect(svc.ready(TENANT, instance.id)).rejects.toThrow(WorkflowNotFoundError);
    await expect(svc.reversalPlan(TENANT, instance.id)).rejects.toThrow(WorkflowNotFoundError);
  });

  it("works without an event bus at all", async () => {
    const quiet = new WorkflowRunService({
      repository,
      workflows,
      capabilities: {
        async isInvocable(): Promise<boolean> {
          return true;
        },
      },
    });
    const workflow = await install();

    const instance = await quiet.start(TENANT, workflow.key, {
      subjectDomain: "attendance",
      subjectId: "student-4471",
      triggeredByUserId: "user-6602",
    });

    expect(await quiet.get(TENANT, instance.id)).toEqual(instance);
    expect(published).toEqual([]);
  });
});
