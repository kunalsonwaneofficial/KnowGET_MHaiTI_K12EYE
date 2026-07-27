import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  type InstanceStatus,
  type StageKind,
  type StageRunStatus,
  type WorkflowTrigger,
  isSettledStageRunStatus,
  isTerminalInstanceStatus,
  normalizeSourceDomain,
  normalizeStageKey,
} from "./decision-value";
import type { InstanceProgress, InstanceSummaryView, StageRunView } from "./decision-view";
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
import { instanceProgress } from "./orchestration";
import type { WorkflowDefinition } from "./workflow";
import { canStartWorkflowInstance } from "./workflow";

/**
 * A running workflow instance — one case moving through one published version of a process.
 *
 * An instance **snapshots the definition it started under**. Every stage becomes a stage run carrying its own
 * ordinal, kind, optionality and dependencies, and from that moment the instance needs nothing from the
 * definition record to enforce its own rules. That is not caching: the definition can be suspended, retired or
 * revised into a new version while this case is still open, and none of that is allowed to change what this case
 * means. A case that started under version three finishes under version three.
 *
 * The dependency rule is the orchestration engine's, enforced here at the transition rather than merely reported:
 * a stage begins only once everything it depends on has **completed or been skipped**. A *failed* dependency
 * releases nothing — the instance stops at the part that did not work rather than carrying on past it, which is
 * the difference between an orchestrator and a queue. So a failed stage fails the whole instance, and it names
 * which stage and why.
 *
 * Only a stage the definition declared `optional` may be skipped. Without that, an instance could report
 * completion having never done the thing the workflow exists to do — a green tick over an empty process.
 * Cancellation is the deliberate exception: a person stopping a case mid-flight settles the outstanding stages as
 * skipped whatever their optionality, because they are not claiming the work was done, they are claiming it will
 * not be.
 *
 * Compensation is the one transition that survives the instance settling. Undoing what a failed or cancelled case
 * already did is the entire point of the contract's third rule, and it necessarily happens *after* the failure.
 */

// --- Stage runs ------------------------------------------------------------------

/**
 * One stage of a running instance, and the instance's own copy of what that stage was when the case started.
 * Structurally a superset of the orchestration and reversal engines' `StageRunView`, so those engines read an
 * instance's runs directly rather than through a projection.
 */
export interface StageRun {
  readonly stageKey: string;
  readonly ordinal: number;
  readonly kind: StageKind;
  readonly status: StageRunStatus;
  /** Snapshotted from the definition: only an optional stage may be skipped. */
  readonly optional: boolean;
  /** Snapshotted from the definition: what must settle before this stage may begin. */
  readonly dependsOn: readonly string[];
  /** The person this stage fell to. Null for an automated action, and null until someone picks it up. */
  readonly assignedToUserId: string | null;
  readonly startedAt: ISODateString | null;
  readonly settledAt: ISODateString | null;
  readonly note: string | null;
  /** The AI runtime's reference for the invocation this stage requested (P2-D26). Null for a human stage. */
  readonly executionRef: string | null;
}

/** Reading order: ordinal first, stage key as the tie-break, so the order is always the same order. */
const byOrdinalThenKey = (a: StageRun, b: StageRun): number =>
  a.ordinal - b.ordinal || a.stageKey.localeCompare(b.stageKey);

/** The stage-run statuses that release the stages depending on them. A failure releases nothing. */
const SATISFYING_STATUSES: readonly string[] = ["completed", "skipped"];

// --- The aggregate ---------------------------------------------------------------

export interface WorkflowInstance {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly workflowId: Uuid;
  /** Snapshotted so a case can name its process even after that version is retired. */
  readonly workflowKey: string;
  readonly workflowVersion: number;
  /** The operational domain the subject lives in (`attendance`, `fees`, `admissions`). */
  readonly subjectDomain: string;
  /** The opaque id of the record this case is about, in its own domain. Never re-modelled here. */
  readonly subjectId: string;
  readonly trigger: WorkflowTrigger;
  /** The person who started it by hand. Null when a signal or an automation rule did. */
  readonly triggeredByUserId: string | null;
  /** The automation rule that started it. Null when a person or a signal did. */
  readonly triggeredByRuleId: string | null;
  /** The recommendation this case came out of, when it came out of one. */
  readonly recommendationId: Uuid | null;
  readonly status: InstanceStatus;
  readonly stageRuns: readonly StageRun[];
  readonly startedAt: ISODateString;
  readonly settledAt: ISODateString | null;
  /** The stage the case stopped at. Non-null only for a failed instance. */
  readonly failureStageKey: string | null;
  readonly failureError: string | null;
  readonly cancelledByUserId: string | null;
  readonly cancellationReason: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface StartWorkflowInstanceParams {
  readonly subjectDomain: string;
  readonly subjectId: string;
  readonly triggeredByUserId?: string | null;
  readonly triggeredByRuleId?: string | null;
  readonly recommendationId?: Uuid | null;
}

/** Take the instance's own copy of a definition's stages, all pending, in reading order. */
const snapshotStages = (workflow: WorkflowDefinition): readonly StageRun[] =>
  [...workflow.stages]
    .sort((a, b) => a.ordinal - b.ordinal || a.key.localeCompare(b.key))
    .map((stage) => ({
      stageKey: stage.key,
      ordinal: stage.ordinal,
      kind: stage.kind,
      status: "pending" as StageRunStatus,
      optional: stage.optional,
      dependsOn: [...stage.dependsOn],
      assignedToUserId: null,
      startedAt: null,
      settledAt: null,
      note: null,
      executionRef: null,
    }));

/**
 * Start a case on a published version of a workflow.
 *
 * A draft has not been inspected, a suspended version has been deliberately closed to new cases, and a retired
 * one is over. Only `published` admits a case, and the refusal is here rather than in a service so that no caller
 * can start one by going around it.
 */
export function startWorkflowInstance(
  workflow: WorkflowDefinition,
  params: StartWorkflowInstanceParams,
): WorkflowInstance {
  if (!canStartWorkflowInstance(workflow)) {
    throw new WorkflowNotPublishedError(workflow.id, workflow.status);
  }

  const subjectDomain = normalizeSourceDomain(params.subjectDomain);
  const subjectId = params.subjectId.trim();
  if (subjectDomain.length === 0 || subjectId.length === 0) {
    throw new EmptyWorkflowSubjectError();
  }

  const triggeredByUserId = params.triggeredByUserId?.trim() || null;
  if (workflow.trigger === "manual" && triggeredByUserId === null) {
    throw new AnonymousWorkflowActionError("started");
  }

  const now = nowIso();

  return {
    id: newUuid(),
    tenantId: workflow.tenantId,
    organizationId: workflow.organizationId,
    workflowId: workflow.id,
    workflowKey: workflow.key,
    workflowVersion: workflow.version,
    subjectDomain,
    subjectId,
    trigger: workflow.trigger,
    triggeredByUserId,
    triggeredByRuleId: params.triggeredByRuleId?.trim() || null,
    recommendationId: params.recommendationId ?? null,
    status: "running",
    stageRuns: snapshotStages(workflow),
    startedAt: now,
    settledAt: null,
    failureStageKey: null,
    failureError: null,
    cancelledByUserId: null,
    cancellationReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

// --- Stage transitions -----------------------------------------------------------

/** Every change stamps the moment it happened; nothing in this aggregate mutates in place. */
const touch = (instance: WorkflowInstance, patch: Partial<WorkflowInstance>): WorkflowInstance => ({
  ...instance,
  ...patch,
  updatedAt: nowIso(),
});

/** A settled instance does not move again, and every stage transition but compensation passes through here. */
function requireRunning(instance: WorkflowInstance): void {
  if (isTerminalInstanceStatus(instance.status)) {
    throw new WorkflowInstanceNotRunningError(instance.id, instance.status);
  }
}

/** The stage run under this key, or a 404 naming both the instance and the key that missed. */
function requireStageRun(instance: WorkflowInstance, stageKey: string): StageRun {
  const key = normalizeStageKey(stageKey);
  const run = instance.stageRuns.find((candidate) => candidate.stageKey === key);
  if (run === undefined) {
    throw new StageRunNotFoundError(instance.id, key);
  }
  return run;
}

/** Replace one stage run in place, preserving the order of the rest. */
const withStageRun = (
  instance: WorkflowInstance,
  stageKey: string,
  patch: Partial<StageRun>,
): readonly StageRun[] =>
  instance.stageRuns.map((run) => (run.stageKey === stageKey ? { ...run, ...patch } : run));

/**
 * An instance settles itself the moment nothing is outstanding. Completion is not a separate act somebody has to
 * remember to perform — a case whose every stage has settled is finished, and saying so anywhere other than here
 * would let one sit silently open forever.
 */
function settleIfComplete(instance: WorkflowInstance): WorkflowInstance {
  const outstanding = instance.stageRuns.some((run) => !isSettledStageRunStatus(run.status));
  if (outstanding || instance.stageRuns.length === 0) {
    return instance;
  }

  return { ...instance, status: "completed", settledAt: nowIso() };
}

export interface BeginStageParams {
  readonly assignedToUserId?: string | null;
}

/**
 * Begin a pending stage. Everything it depends on must have completed or been skipped first; the unsatisfied
 * dependencies come back with the refusal, so a caller is told what it is waiting for rather than merely that it
 * is waiting.
 */
export function beginStage(
  instance: WorkflowInstance,
  stageKey: string,
  params: BeginStageParams = {},
): WorkflowInstance {
  requireRunning(instance);
  const run = requireStageRun(instance, stageKey);
  if (run.status !== "pending") {
    throw new InvalidStageTransitionError(run.stageKey, run.status, "active");
  }

  const statusByKey = new Map(
    instance.stageRuns.map((candidate) => [candidate.stageKey, candidate.status] as const),
  );
  const unsatisfied = run.dependsOn.filter((key) => {
    const status = statusByKey.get(key);
    return status === undefined || !SATISFYING_STATUSES.includes(status);
  });
  if (unsatisfied.length > 0) {
    throw new StageDependenciesUnsettledError(run.stageKey, unsatisfied);
  }

  return touch(instance, {
    stageRuns: withStageRun(instance, run.stageKey, {
      status: "active",
      startedAt: nowIso(),
      assignedToUserId: params.assignedToUserId?.trim() || run.assignedToUserId,
    }),
  });
}

export interface CompleteStageParams {
  readonly note?: string | null;
  /** The AI runtime's reference for the invocation this stage requested (P2-D26). */
  readonly executionRef?: string | null;
}

/** Complete an active stage, settling the instance too when nothing is left outstanding. */
export function completeStage(
  instance: WorkflowInstance,
  stageKey: string,
  params: CompleteStageParams = {},
): WorkflowInstance {
  requireRunning(instance);
  const run = requireStageRun(instance, stageKey);
  if (run.status !== "active") {
    throw new InvalidStageTransitionError(run.stageKey, run.status, "completed");
  }

  return settleIfComplete(
    touch(instance, {
      stageRuns: withStageRun(instance, run.stageKey, {
        status: "completed",
        settledAt: nowIso(),
        note: params.note?.trim() || run.note,
        executionRef: params.executionRef?.trim() || run.executionRef,
      }),
    }),
  );
}

export interface SkipStageParams {
  readonly note?: string | null;
}

/** Skip a stage the definition declared optional. A required stage is not skippable at any price. */
export function skipStage(
  instance: WorkflowInstance,
  stageKey: string,
  params: SkipStageParams = {},
): WorkflowInstance {
  requireRunning(instance);
  const run = requireStageRun(instance, stageKey);
  if (run.status !== "pending" && run.status !== "active") {
    throw new InvalidStageTransitionError(run.stageKey, run.status, "skipped");
  }
  if (!run.optional) {
    throw new RequiredStageNotSkippableError(run.stageKey);
  }

  return settleIfComplete(
    touch(instance, {
      stageRuns: withStageRun(instance, run.stageKey, {
        status: "skipped",
        settledAt: nowIso(),
        note: params.note?.trim() || run.note,
      }),
    }),
  );
}

export interface FailStageParams {
  readonly error: string;
  readonly executionRef?: string | null;
}

/**
 * Fail an active stage — and, with it, the case. The instance stops at the stage that did not work and records
 * which one and why, rather than releasing the stages behind it and finishing around the hole.
 */
export function failStage(
  instance: WorkflowInstance,
  stageKey: string,
  params: FailStageParams,
): WorkflowInstance {
  requireRunning(instance);
  const run = requireStageRun(instance, stageKey);
  if (run.status !== "active") {
    throw new InvalidStageTransitionError(run.stageKey, run.status, "failed");
  }

  const now = nowIso();

  return touch(instance, {
    status: "failed",
    settledAt: now,
    failureStageKey: run.stageKey,
    failureError: params.error.trim() || null,
    stageRuns: withStageRun(instance, run.stageKey, {
      status: "failed",
      settledAt: now,
      executionRef: params.executionRef?.trim() || run.executionRef,
    }),
  });
}

/**
 * **Rule three, at the stage.** Record that a completed stage has been put back. This is the one transition that
 * outlives the instance: undoing what a failed or cancelled case already did necessarily happens after it
 * settled, and refusing it then would make the rollback obligation unsatisfiable exactly when it matters.
 */
export function compensateStage(instance: WorkflowInstance, stageKey: string): WorkflowInstance {
  const run = requireStageRun(instance, stageKey);
  if (run.status !== "completed") {
    throw new InvalidStageTransitionError(run.stageKey, run.status, "compensated");
  }

  return touch(instance, {
    stageRuns: withStageRun(instance, run.stageKey, {
      status: "compensated",
      settledAt: nowIso(),
    }),
  });
}

// --- Instance lifecycle ----------------------------------------------------------

export interface CancelWorkflowInstanceParams {
  readonly cancelledByUserId: string;
  readonly reason?: string | null;
}

/**
 * Stop a case, naming the person who stopped it. Everything still outstanding is settled as skipped whatever its
 * optionality — a cancellation does not claim the work was done, it claims it will not be — and everything
 * already completed stays completed, so a reversal plan can still find it.
 */
export function cancelWorkflowInstance(
  instance: WorkflowInstance,
  params: CancelWorkflowInstanceParams,
): WorkflowInstance {
  requireRunning(instance);

  const cancelledByUserId = params.cancelledByUserId.trim();
  if (cancelledByUserId.length === 0) {
    throw new AnonymousWorkflowActionError("cancelled");
  }

  const now = nowIso();

  return touch(instance, {
    status: "cancelled",
    settledAt: now,
    cancelledByUserId,
    cancellationReason: params.reason?.trim() || null,
    stageRuns: instance.stageRuns.map((run) =>
      isSettledStageRunStatus(run.status)
        ? run
        : { ...run, status: "skipped" as StageRunStatus, settledAt: now },
    ),
  });
}

// --- Reading ---------------------------------------------------------------------

/** Whether the case is still moving. */
export const isWorkflowInstanceRunning = (instance: WorkflowInstance): boolean =>
  !isTerminalInstanceStatus(instance.status);

/** A stage run by key, or null when this instance does not carry one. */
export const instanceStageRun = (instance: WorkflowInstance, stageKey: string): StageRun | null =>
  instance.stageRuns.find((run) => run.stageKey === normalizeStageKey(stageKey)) ?? null;

/**
 * The stages that may begin right now, in reading order: pending, and with every dependency completed or
 * skipped. Computed from the instance's own snapshot, so it answers correctly even for a case whose definition
 * version has since been retired.
 */
export function readyInstanceStageKeys(instance: WorkflowInstance): readonly string[] {
  if (!isWorkflowInstanceRunning(instance)) {
    return [];
  }

  const statusByKey = new Map(instance.stageRuns.map((run) => [run.stageKey, run.status] as const));
  const satisfied = (key: string): boolean => {
    const status = statusByKey.get(key);
    return status !== undefined && SATISFYING_STATUSES.includes(status);
  };

  return [...instance.stageRuns]
    .filter((run) => run.status === "pending")
    .filter((run) => run.dependsOn.every(satisfied))
    .sort(byOrdinalThenKey)
    .map((run) => run.stageKey);
}

/** The completed stages of this case, in the order they completed — what a reversal plan works backwards from. */
export const completedStageKeys = (instance: WorkflowInstance): readonly string[] =>
  [...instance.stageRuns]
    .filter((run) => run.status === "completed")
    .sort(byOrdinalThenKey)
    .map((run) => run.stageKey);

/** How far through the case execution has got. */
export const workflowInstanceProgress = (instance: WorkflowInstance): InstanceProgress =>
  instanceProgress(toStageRunViews(instance));

// --- Engine views ----------------------------------------------------------------

/** The case as the orchestration and reversal engines read it. */
export const toStageRunViews = (instance: WorkflowInstance): readonly StageRunView[] =>
  instance.stageRuns;

/** The case as the metrics engine reads it. */
export const toInstanceSummaryView = (instance: WorkflowInstance): InstanceSummaryView => ({
  id: instance.id,
  status: instance.status,
});
