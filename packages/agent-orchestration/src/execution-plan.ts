import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  type PlanStatus,
  type StepStatus,
  isSettledStepStatus,
  isTerminalPlanStatus,
  normalizeCapabilityKey,
} from "./ai-value";
import type { PlanInspection, PlanProgress, PlanStepView, PlanView, ToolView } from "./ai-view";
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
import { inspectPlan, planProgress } from "./planning";

/**
 * One step of an execution plan: a single capability the agent proposes to invoke, what it waits on, and — once
 * it has run — the invocation that carried it out.
 *
 * A step names a capability *key*, never anything else. It cannot describe a query, a statement or a target
 * record, because a step is a reference into the capability catalog and the catalog has nowhere to put such a
 * thing. That is how "agents invoke capabilities, never databases directly" survives contact with planning.
 */
export interface ExecutionStep {
  readonly id: Uuid;
  readonly ordinal: number;
  /** The catalogued capability this step invokes. */
  readonly capabilityKey: string;
  /** What this step is for, in the author's words — for the human inspecting the plan. */
  readonly intent: string | null;
  /** Ids of steps in this plan that must have succeeded first. */
  readonly dependsOn: readonly string[];
  readonly status: StepStatus;
  /** The invocation that executed this step, once one has. */
  readonly invocationId: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

/**
 * An execution plan — the artifact that makes an agent's intentions **inspectable before anything runs**, which
 * is what separates this runtime from an agent loop that acts and reports afterwards.
 *
 * A plan is authored as a `drafted` list of steps, then submitted, and submission is where the two gates sit.
 * The first is structural: {@link submitExecutionPlan} inspects the plan and refuses an unsound one outright.
 * The second is human: if anything in the plan is irreversible, `critical`, or flagged as always needing a
 * person, the plan lands in `awaiting_approval` and {@link startExecution} will not move it — the approval gate
 * is enforced by the plan itself, not by the discipline of whatever is executing it.
 *
 * Steps are entities of this aggregate rather than records of their own, because the invariants worth having are
 * invariants *across* steps: a dependency must name a sibling, a step cannot be removed while another waits on
 * it, and a step cannot begin before what it waits on has succeeded. Holding steps here also means a plan can
 * only ever be *built* as a DAG — a step may only depend on steps already added, so a cycle cannot be authored.
 * The inspection engine still checks for cycles, because a plan can also arrive from a store or an import.
 *
 * Whether *this agent* is allowed to run this plan is a separate question, answered by the authorization engine
 * against the agent's grants at execution time. A plan is a shape; a grant is a permission; the runtime checks
 * both.
 */
export interface ExecutionPlan {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** The agent that proposed this plan. */
  readonly agentId: string;
  /** The reasoning session this plan came out of, when it came out of one. */
  readonly reasoningSessionId: string | null;
  /** What the plan is trying to achieve, stated for the human who inspects it. */
  readonly goal: string;
  readonly status: PlanStatus;
  readonly steps: readonly ExecutionStep[];
  /** True once inspection found something in the plan that needs a person. Set when the plan is submitted. */
  readonly requiresApproval: boolean;
  /** The approval request that decided this plan, once one has. */
  readonly approvalRequestId: string | null;
  /** When the plan was last inspected — null while it is still being authored. */
  readonly inspectedAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateExecutionPlanParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly agentId: string;
  readonly goal: string;
  readonly reasoningSessionId?: string | null;
}

export interface AddPlanStepParams {
  readonly capabilityKey: string;
  readonly intent?: string | null;
  /** Ids of steps already in this plan that must succeed first. */
  readonly dependsOn?: readonly string[];
}

/** Draft an execution plan (status `drafted`, no steps). Steps are added one at a time, before submission. */
export function createExecutionPlan(params: CreateExecutionPlanParams): ExecutionPlan {
  const goal = params.goal.trim();
  if (goal.length === 0) {
    throw new EmptyPlanGoalError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    agentId: params.agentId,
    reasoningSessionId: params.reasoningSessionId ?? null,
    goal,
    status: "drafted",
    steps: [],
    requiresApproval: false,
    approvalRequestId: null,
    inspectedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (plan: ExecutionPlan, patch: Partial<ExecutionPlan>): ExecutionPlan => ({
  ...plan,
  ...patch,
  updatedAt: nowIso(),
});

/** Find a step of this plan, or refuse. */
function requireStep(plan: ExecutionPlan, stepId: string): ExecutionStep {
  const step = plan.steps.find((candidate) => candidate.id === stepId);
  if (!step) {
    throw new PlanStepNotFoundError(stepId);
  }
  return step;
}

/** Replace one step, leaving the rest and the plan's own status alone. */
const withStep = (plan: ExecutionPlan, next: ExecutionStep): ExecutionPlan =>
  touch(plan, {
    steps: plan.steps.map((step) => (step.id === next.id ? next : step)),
  });

/** Restate the goal of a plan that is still being authored. */
export function restatePlanGoal(plan: ExecutionPlan, goal: string): ExecutionPlan {
  if (plan.status !== "drafted") {
    throw new InvalidPlanTransitionError(plan.status, "restated");
  }
  const next = goal.trim();
  if (next.length === 0) {
    throw new EmptyPlanGoalError();
  }
  return touch(plan, { goal: next });
}

/**
 * Add a step to a plan that is still being authored. The ordinal is assigned, not accepted, so a plan cannot
 * carry two steps in the same place; dependencies must name steps already in the plan, so an author cannot
 * write a cycle or a dangling edge.
 */
export function addPlanStep(plan: ExecutionPlan, params: AddPlanStepParams): ExecutionPlan {
  if (plan.status !== "drafted") {
    throw new InvalidPlanTransitionError(plan.status, "step-added");
  }
  const known = new Set<string>(plan.steps.map((step) => step.id));
  const dependsOn: string[] = [];
  for (const dependencyId of params.dependsOn ?? []) {
    if (!known.has(dependencyId)) {
      throw new UnknownStepDependencyError(dependencyId);
    }
    if (!dependsOn.includes(dependencyId)) {
      dependsOn.push(dependencyId);
    }
  }

  const now = nowIso();
  const step: ExecutionStep = {
    id: newUuid(),
    ordinal: plan.steps.length + 1,
    capabilityKey: normalizeCapabilityKey(params.capabilityKey),
    intent: params.intent?.trim() || null,
    dependsOn,
    status: "pending",
    invocationId: null,
    createdAt: now,
    updatedAt: now,
  };
  return touch(plan, { steps: [...plan.steps, step] });
}

/**
 * Remove a step from a plan that is still being authored. Refused while another step waits on it — dropping it
 * would leave the plan referring to something that is not there. Remaining steps are renumbered so ordinals stay
 * a contiguous reading order.
 */
export function removePlanStep(plan: ExecutionPlan, stepId: string): ExecutionPlan {
  if (plan.status !== "drafted") {
    throw new InvalidPlanTransitionError(plan.status, "step-removed");
  }
  requireStep(plan, stepId);
  const dependent = plan.steps.find((step) => step.dependsOn.includes(stepId));
  if (dependent) {
    throw new StepDependedUponError(stepId, dependent.id);
  }
  return touch(plan, {
    steps: plan.steps
      .filter((step) => step.id !== stepId)
      .map((step, index) => ({ ...step, ordinal: index + 1 })),
  });
}

/** The narrow views the planning engine reads. */
export const toPlanStepViews = (plan: ExecutionPlan): readonly PlanStepView[] =>
  plan.steps.map((step) => ({
    id: step.id,
    ordinal: step.ordinal,
    capabilityKey: step.capabilityKey,
    status: step.status,
    dependsOn: step.dependsOn,
  }));

/** The narrow view the metrics engine reads. */
export const toPlanView = (plan: ExecutionPlan): PlanView => ({
  id: plan.id,
  agentId: plan.agentId,
  status: plan.status,
});

/**
 * Inspect a plan against the capability catalog without moving it. This is the read that makes a plan
 * inspectable *before* it runs: an operator, an API consumer or the author can ask what a plan would do — its
 * worst risk, what could not be undone, everything structurally wrong with it — with nothing executed and no
 * state changed.
 */
export const inspectExecutionPlan = (
  plan: ExecutionPlan,
  tools: readonly ToolView[],
): PlanInspection => inspectPlan(toPlanStepViews(plan), tools);

/**
 * Submit an authored plan. The plan is inspected against the catalog first and an unsound one is refused with
 * every issue found — a plan is never submitted on the promise that it is fine.
 *
 * A sound plan goes to `approved` when nothing in it needs a person and `awaiting_approval` when something
 * does. That determination is made here, once, from the catalog as it stands, and recorded on the plan; the
 * decision is therefore auditable rather than recomputed at execution time from a catalog that may have moved.
 */
export function submitExecutionPlan(
  plan: ExecutionPlan,
  tools: readonly ToolView[],
): ExecutionPlan {
  if (plan.status !== "drafted") {
    throw new InvalidPlanTransitionError(plan.status, "submitted");
  }
  const inspection = inspectExecutionPlan(plan, tools);
  if (!inspection.sound) {
    throw new UnsoundPlanError(inspection.issues);
  }
  return touch(plan, {
    status: inspection.requiresApproval ? "awaiting_approval" : "approved",
    requiresApproval: inspection.requiresApproval,
    inspectedAt: nowIso(),
  });
}

/** Record a human's approval of a plan (`awaiting_approval → approved`). */
export function approveExecutionPlan(
  plan: ExecutionPlan,
  approvalRequestId: string,
): ExecutionPlan {
  if (plan.status !== "awaiting_approval") {
    throw new InvalidPlanTransitionError(plan.status, "approved");
  }
  return touch(plan, { status: "approved", approvalRequestId });
}

/** Record a human's refusal of a plan (`awaiting_approval → rejected`, terminal). */
export function rejectExecutionPlan(plan: ExecutionPlan, approvalRequestId: string): ExecutionPlan {
  if (plan.status !== "awaiting_approval") {
    throw new InvalidPlanTransitionError(plan.status, "rejected");
  }
  return touch(plan, { status: "rejected", approvalRequestId });
}

/**
 * Start executing an approved plan (`approved → executing`). A plan waiting on a human is refused with a
 * distinct error, because "you have not been approved yet" and "this plan is in the wrong state" are different
 * things to whoever is holding the request.
 */
export function startExecution(plan: ExecutionPlan): ExecutionPlan {
  if (plan.status === "awaiting_approval") {
    throw new PlanApprovalRequiredError(plan.id);
  }
  if (plan.status !== "approved") {
    throw new InvalidPlanTransitionError(plan.status, "executing");
  }
  return touch(plan, { status: "executing" });
}

/** Begin a step (`pending → executing`). Refused unless the plan is executing and everything it waits on has succeeded. */
export function beginStep(plan: ExecutionPlan, stepId: string): ExecutionPlan {
  if (plan.status !== "executing") {
    throw new InvalidPlanTransitionError(plan.status, "step-executing");
  }
  const step = requireStep(plan, stepId);
  if (step.status !== "pending") {
    throw new InvalidStepTransitionError(step.status, "executing");
  }
  for (const dependencyId of step.dependsOn) {
    const dependency = plan.steps.find((candidate) => candidate.id === dependencyId);
    if (dependency?.status !== "succeeded") {
      throw new StepDependencyNotMetError(step.id, dependencyId);
    }
  }
  return withStep(plan, { ...step, status: "executing", updatedAt: nowIso() });
}

/** Record that a step succeeded, and which invocation carried it out. */
export function succeedStep(
  plan: ExecutionPlan,
  stepId: string,
  invocationId: string,
): ExecutionPlan {
  const step = requireStep(plan, stepId);
  if (step.status !== "executing") {
    throw new InvalidStepTransitionError(step.status, "succeeded");
  }
  return withStep(plan, { ...step, status: "succeeded", invocationId, updatedAt: nowIso() });
}

/** Record that a step failed. The plan does not fail with it — whether to roll back is a decision above this. */
export function failStep(
  plan: ExecutionPlan,
  stepId: string,
  invocationId?: string | null,
): ExecutionPlan {
  const step = requireStep(plan, stepId);
  if (step.status !== "executing") {
    throw new InvalidStepTransitionError(step.status, "failed");
  }
  return withStep(plan, {
    ...step,
    status: "failed",
    invocationId: invocationId ?? step.invocationId,
    updatedAt: nowIso(),
  });
}

/** Skip a step that will not run — because a step it waited on failed, or because the plan is being abandoned. */
export function skipStep(plan: ExecutionPlan, stepId: string): ExecutionPlan {
  const step = requireStep(plan, stepId);
  if (step.status !== "pending") {
    throw new InvalidStepTransitionError(step.status, "skipped");
  }
  return withStep(plan, { ...step, status: "skipped", updatedAt: nowIso() });
}

/** Record that a step that had succeeded has been undone by its compensating invocation. */
export function compensateStep(plan: ExecutionPlan, stepId: string): ExecutionPlan {
  const step = requireStep(plan, stepId);
  if (step.status !== "succeeded") {
    throw new InvalidStepTransitionError(step.status, "compensated");
  }
  return withStep(plan, { ...step, status: "compensated", updatedAt: nowIso() });
}

/** Complete a plan (`executing → completed`). Refused while any step is still outstanding. */
export function completeExecution(plan: ExecutionPlan): ExecutionPlan {
  if (plan.status !== "executing") {
    throw new InvalidPlanTransitionError(plan.status, "completed");
  }
  const outstanding = plan.steps.filter((step) => !isSettledStepStatus(step.status)).length;
  if (outstanding > 0) {
    throw new PlanNotSettledError(plan.id, outstanding);
  }
  return touch(plan, { status: "completed" });
}

/** Fail a plan (`executing → failed`). What it already did stands until a rollback undoes it. */
export function failExecution(plan: ExecutionPlan): ExecutionPlan {
  if (plan.status !== "executing") {
    throw new InvalidPlanTransitionError(plan.status, "failed");
  }
  return touch(plan, { status: "failed" });
}

/**
 * Record that a plan has been rolled back (`executing`/`failed → rolled_back`). Reachable from a running plan
 * too, because a rollback is sometimes what stops one.
 */
export function rollBackExecution(plan: ExecutionPlan): ExecutionPlan {
  if (plan.status !== "executing" && plan.status !== "failed") {
    throw new InvalidPlanTransitionError(plan.status, "rolled_back");
  }
  return touch(plan, { status: "rolled_back" });
}

/** Cancel a plan from any non-terminal state. Steps that never ran are left as they are — the record is honest. */
export function cancelExecution(plan: ExecutionPlan): ExecutionPlan {
  if (isTerminalPlanStatus(plan.status)) {
    throw new InvalidPlanTransitionError(plan.status, "cancelled");
  }
  return touch(plan, { status: "cancelled" });
}

/** How far through the plan execution has got. */
export const executionProgress = (plan: ExecutionPlan): PlanProgress =>
  planProgress(toPlanStepViews(plan));

/** Whether the plan may still be executed against — approved or already running. */
export const isPlanRunnable = (plan: ExecutionPlan): boolean =>
  plan.status === "approved" || plan.status === "executing";
