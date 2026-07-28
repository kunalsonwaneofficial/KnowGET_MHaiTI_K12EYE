import { isCompletedStageRunStatus, toRate } from "./decision-value";
import type { CompensationState, ExecutionOutcome } from "./decision-value";
import type {
  ActionView,
  ReversalPlan,
  ReversalStep,
  StageRunView,
  WorkflowStageView,
} from "./decision-view";

/**
 * The reversal engine — the enforcement point of the contract's third rule: **automation carries rollback or
 * compensation**.
 *
 * The rule is easy to state and easy to fake. A system fakes it by declaring everything compensatable and never
 * checking whether a compensating capability actually exists; the declaration passes review and the rollback
 * fails at three in the morning. So this engine is pessimistic in exactly one direction: a stage that *claims*
 * to be compensatable but names nothing to compensate it, or invoked nothing a machine could undo, is reported
 * as beyond the plan's reach rather than as a step to be worked out later. A missing declaration is not a gap in
 * the plan — it is the plan, and the plan is that this will still be true afterwards.
 *
 * A reversal plan is therefore two things at once: the compensating invocations to make, and an honest list of
 * what the reversal will not reach. A plan that met such a stage does not silently drop it and report success,
 * because an operator authorising a rollback needs to know its limits *before* they authorise it.
 *
 * Order matters. Compensation runs in the reverse of the order the stages completed in — the last thing done is
 * the first thing undone — because a compensation generally assumes the world is in the state its own stage
 * left it in, and undoing an earlier stage first can invalidate that assumption.
 *
 * Only *completed* stages are reversed. A skipped stage did nothing; a pending stage never began. The failed
 * stage is the interesting case, and it is handled on the automation side by {@link compensationStateFor},
 * which treats a reached-but-failed invocation as something that may still need putting back — the capability
 * was called, and a failure report is not proof that nothing changed.
 *
 * Nothing here invokes anything. The engine says what the reversal *is*; the service decides whether to run it.
 */

/**
 * Whether a completed stage can actually be put back by an automated plan, as opposed to merely claiming it
 * can. A compensatable stage needs both halves: something declared to undo it, and a capability it invoked for
 * that undo to answer. A stage a person carried out has no capability, so no plan can reverse it — a person
 * must, and the plan says so rather than implying otherwise.
 */
const canBeUndone = (stage: WorkflowStageView): boolean => {
  if (stage.reversibility === "reversible") {
    return true;
  }
  if (stage.reversibility === "irreversible") {
    return false;
  }
  return stage.compensationKey !== null && stage.capabilityKey !== null;
};

/**
 * Reverse completion order: latest settled first. Runs whose `settledAt` cannot be read fall back to the stage
 * ordinal, and the stage key breaks any remaining tie, so a plan for the same instance is always the same plan.
 */
const byReverseCompletion = (a: StageRunView, b: StageRunView): number => {
  const settledA = a.settledAt === null ? Number.NaN : Date.parse(a.settledAt);
  const settledB = b.settledAt === null ? Number.NaN : Date.parse(b.settledAt);
  if (!Number.isNaN(settledA) && !Number.isNaN(settledB) && settledA !== settledB) {
    return settledB - settledA;
  }
  return b.ordinal - a.ordinal || a.stageKey.localeCompare(b.stageKey);
};

/**
 * Plan the undo of what a workflow instance has already done: the compensating invocations in reverse
 * completion order, and the stages that will still stand afterwards because no plan can put them back.
 *
 * A `reversible` stage contributes no step — there is nothing to invoke — but it does not count against the
 * plan either, because nothing it did needs undoing.
 *
 * `fullyReversible` is true when nothing is beyond the plan's reach, including for an instance that has
 * completed no stages at all: the honest answer to "can this be rolled back?" is yes, there is nothing to roll
 * back. `reversibleShare` is 0 in that case, because there is no share of nothing.
 */
export function planReversal(
  stages: readonly WorkflowStageView[],
  runs: readonly StageRunView[],
): ReversalPlan {
  const stageByKey = new Map(stages.map((stage) => [stage.key, stage] as const));
  const completed = runs
    .filter((run) => isCompletedStageRunStatus(run.status) && stageByKey.has(run.stageKey))
    .sort(byReverseCompletion);

  const steps: ReversalStep[] = [];
  const irreversibleStageKeys: string[] = [];

  for (const run of completed) {
    const stage = stageByKey.get(run.stageKey);
    if (stage === undefined) {
      continue;
    }
    if (!canBeUndone(stage)) {
      irreversibleStageKeys.push(stage.key);
      continue;
    }
    const { capabilityKey, compensationKey } = stage;
    if (capabilityKey !== null && compensationKey !== null) {
      steps.push({
        stageKey: stage.key,
        capabilityKey,
        compensationKey,
        ordinal: steps.length + 1,
      });
    }
  }

  return {
    steps,
    irreversibleStageKeys,
    fullyReversible: irreversibleStageKeys.length === 0,
    reversibleShare: toRate(completed.length - irreversibleStageKeys.length, completed.length),
  };
}

/** Whether everything an instance has done can be put back. The value an operator is shown before authorising. */
export const isFullyReversible = (
  stages: readonly WorkflowStageView[],
  runs: readonly StageRunView[],
): boolean => planReversal(stages, runs).fullyReversible;

/** The completed stages that will still stand after the reversal runs. */
export const irreversibleCompletedStageKeys = (
  stages: readonly WorkflowStageView[],
  runs: readonly StageRunView[],
): readonly string[] => planReversal(stages, runs).irreversibleStageKeys;

/** Whether a plan has any work in it at all. An empty plan is not a failure — it is nothing to undo. */
export const requiresCompensation = (plan: ReversalPlan): boolean => plan.steps.length > 0;

/** The distinct compensating capabilities a plan invokes, in the order the plan first invokes them. */
export const reversalCapabilityKeys = (plan: ReversalPlan): readonly string[] => [
  ...new Set(plan.steps.map((step) => step.compensationKey)),
];

/** The step that undoes a given stage, or null when the plan does not reach it. */
export const reversalStepFor = (plan: ReversalPlan, stageKey: string): ReversalStep | null =>
  plan.steps.find((step) => step.stageKey === stageKey) ?? null;

/**
 * Where an automation run stands on putting the world back, given what its action was and how far execution
 * got.
 *
 * Only `not_started` is proof that nothing changed. A `requested` invocation may have landed with the response
 * lost, and a `failed` one may have half-landed — in both cases the capability was reached, so the engine
 * reports compensation as *available* rather than unnecessary. Reporting "not required" on the strength of a
 * failure report is precisely how a rollback obligation gets quietly dropped.
 *
 * A compensatable action with no declared compensation reports `irreversible`, for the reason in the module
 * comment: the declaration is what makes compensation real.
 */
export function compensationStateFor(
  action: ActionView,
  outcome: ExecutionOutcome,
): CompensationState {
  if (outcome === "compensated") {
    return "compensated";
  }
  if (outcome === "not_started") {
    return "not_required";
  }
  if (action.reversibility === "reversible") {
    return "not_required";
  }
  if (action.reversibility === "irreversible") {
    return "irreversible";
  }
  return action.compensationKey === null ? "irreversible" : "available";
}

/** Whether a run still owes the institution a rollback it has not made. */
export const isCompensationOutstanding = (state: CompensationState): boolean =>
  state === "available";
