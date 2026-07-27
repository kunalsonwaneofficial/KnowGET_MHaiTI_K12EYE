import type { CompensationPlan, CompensationStep, InvocationView } from "./ai-view";

/**
 * The rollback engine — how an execution that went wrong is undone, and the enforcement point of the contract's
 * requirement that **tool invocation carries rollback**.
 *
 * Its discipline is honesty. Compensation runs in the reverse of the order things succeeded, because undoing
 * out of order is not undoing. A `reversible` invocation needs nothing. A `compensatable` one is undone by
 * invoking the compensating capability it declared. An `irreversible` one **cannot** be undone, and the engine
 * says so rather than quietly skipping it: the plan reports it, and {@link CompensationPlan.fullyReversible} is
 * false. A rollback that meets an irreversible invocation is partial, and the operator has to know that.
 *
 * Only *succeeded* invocations are compensated. An invocation that failed changed nothing to undo; one already
 * `compensated` has been undone; one still `authorized` or `executing` has not landed.
 */

/** Whether an invocation actually landed and so may need undoing. */
const hasLanded = (invocation: InvocationView): boolean => invocation.status === "succeeded";

/**
 * Build the plan to undo what these invocations have already done. Compensating steps come back in reverse
 * ordinal order (last done, first undone), numbered from 1; invocations that cannot be undone are listed
 * separately rather than silently dropped.
 *
 * A `compensatable` invocation with no `compensationKey` is a contradiction the aggregate refuses to create —
 * if one reaches here anyway (an older record, a hand-written row), it is counted as irreversible rather than
 * trusted, because the engine cannot invent the capability that would undo it.
 */
export function compensationPlan(invocations: readonly InvocationView[]): CompensationPlan {
  const landed = invocations.filter(hasLanded);
  const ordered = [...landed].sort((a, b) => b.ordinal - a.ordinal);

  const steps: CompensationStep[] = [];
  const irreversibleInvocationIds: string[] = [];

  for (const invocation of ordered) {
    if (invocation.reversibility === "reversible") {
      continue;
    }
    if (invocation.reversibility === "compensatable" && invocation.compensationKey) {
      steps.push({
        invocationId: invocation.id,
        capabilityKey: invocation.capabilityKey,
        compensationKey: invocation.compensationKey,
        ordinal: steps.length + 1,
      });
      continue;
    }
    irreversibleInvocationIds.push(invocation.id);
  }

  return {
    steps,
    irreversibleInvocationIds,
    fullyReversible: irreversibleInvocationIds.length === 0,
  };
}

/** Whether everything these invocations did can be completely undone. */
export const isFullyReversible = (invocations: readonly InvocationView[]): boolean =>
  compensationPlan(invocations).fullyReversible;

/** The invocations that landed and can never be undone — what an operator needs to see before rolling back. */
export const irreversibleInvocations = (
  invocations: readonly InvocationView[],
): readonly InvocationView[] => {
  const blocked = new Set(compensationPlan(invocations).irreversibleInvocationIds);
  return invocations.filter((invocation) => blocked.has(invocation.id));
};

/**
 * How much of what landed can be undone, as a percent 0–100 with two decimals. 100 when nothing landed — there
 * is nothing outstanding to undo.
 */
export function reversibleShare(invocations: readonly InvocationView[]): number {
  const landed = invocations.filter(hasLanded);
  if (landed.length === 0) {
    return 100;
  }
  const blocked = compensationPlan(invocations).irreversibleInvocationIds.length;
  return Math.round(((landed.length - blocked) * 100 * 100) / landed.length) / 100;
}
