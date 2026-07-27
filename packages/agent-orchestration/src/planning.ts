import { type RiskLevel, isSettledStepStatus, riskRank } from "./ai-value";
import type { PlanInspection, PlanIssue, PlanProgress, PlanStepView, ToolView } from "./ai-view";

/**
 * The plan-inspection engine — what makes an execution plan **inspectable before it runs**, which is the
 * contract's requirement and the reason a plan is a first-class record rather than a hidden agent loop.
 *
 * Inspection answers, without executing anything: is this plan structurally sound (does every step name a real,
 * active capability; are the dependencies a DAG); what is the worst thing in it (highest risk); could any of it
 * not be undone (irreversible steps); and does it need a human before it may start. Ordinals are reading order;
 * `dependsOn` is the real order, so a plan is a DAG and the engine detects cycles rather than assuming them
 * away.
 */

/** Index the capability catalog by key for lookup. */
const indexTools = (tools: readonly ToolView[]): ReadonlyMap<string, ToolView> =>
  new Map(tools.map((tool) => [tool.key, tool]));

/** The highest risk among the given capabilities, or null when there are none. */
export function highestRisk(tools: readonly ToolView[]): RiskLevel | null {
  let worst: RiskLevel | null = null;
  for (const tool of tools) {
    if (worst === null || riskRank(tool.riskLevel) > riskRank(worst)) {
      worst = tool.riskLevel;
    }
  }
  return worst;
}

/**
 * Detect whether the steps' `dependsOn` edges contain a cycle, returning the ids of every step that sits on
 * one. Iterative depth-first colouring — no recursion, so a pathological plan cannot blow the stack.
 */
function stepsInCycles(steps: readonly PlanStepView[]): ReadonlySet<string> {
  const edges = new Map<string, readonly string[]>(steps.map((s) => [s.id, s.dependsOn]));
  const state = new Map<string, "visiting" | "done">();
  const onCycle = new Set<string>();

  for (const step of steps) {
    if (state.get(step.id) === "done") {
      continue;
    }
    // (node, indexOfNextDependencyToWalk) — an explicit stack standing in for recursion.
    const stack: { id: string; next: number }[] = [{ id: step.id, next: 0 }];
    state.set(step.id, "visiting");
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (!frame) {
        break;
      }
      const deps = edges.get(frame.id) ?? [];
      if (frame.next >= deps.length) {
        state.set(frame.id, "done");
        stack.pop();
        continue;
      }
      const dep = deps[frame.next];
      frame.next += 1;
      if (dep === undefined || dep === frame.id || !edges.has(dep)) {
        // Unknown dependencies and self-dependencies each have their own, more specific issue code —
        // reporting them again as a cycle would be noise, so the walk skips them.
        continue;
      }
      if (state.get(dep) === "visiting") {
        // Everything still on the stack from `dep` upward is on the cycle.
        const from = stack.findIndex((f) => f.id === dep);
        for (let i = from; i >= 0 && i < stack.length; i += 1) {
          const frameOnCycle = stack[i];
          if (frameOnCycle) {
            onCycle.add(frameOnCycle.id);
          }
        }
      } else if (state.get(dep) !== "done") {
        state.set(dep, "visiting");
        stack.push({ id: dep, next: 0 });
      }
    }
  }
  return onCycle;
}

/**
 * Inspect a plan before it runs. Reports every structural issue it finds (it does not stop at the first), the
 * worst risk in it, which steps could not be undone, and whether it needs a human — a plan requires approval
 * when any capability in it demands approval, is irreversible, or carries `critical` risk. Whether *this agent*
 * may run it is the authorization engine's question; this is the plan's own shape.
 */
export function inspectPlan(
  steps: readonly PlanStepView[],
  tools: readonly ToolView[],
): PlanInspection {
  const catalog = indexTools(tools);
  const issues: PlanIssue[] = [];
  const ids = new Set(steps.map((s) => s.id));
  const seenOrdinals = new Set<number>();
  const resolved: ToolView[] = [];
  const irreversibleStepIds: string[] = [];
  const compensatableStepIds: string[] = [];

  if (steps.length === 0) {
    issues.push({ stepId: null, code: "empty_plan", ref: null });
  }

  for (const step of steps) {
    if (seenOrdinals.has(step.ordinal)) {
      issues.push({ stepId: step.id, code: "duplicate_ordinal", ref: String(step.ordinal) });
    }
    seenOrdinals.add(step.ordinal);

    const tool = catalog.get(step.capabilityKey);
    if (!tool) {
      issues.push({ stepId: step.id, code: "unknown_capability", ref: step.capabilityKey });
    } else {
      if (tool.status !== "active") {
        issues.push({ stepId: step.id, code: "capability_not_active", ref: tool.key });
      }
      resolved.push(tool);
      if (tool.reversibility === "irreversible") {
        irreversibleStepIds.push(step.id);
      } else if (tool.reversibility === "compensatable") {
        compensatableStepIds.push(step.id);
      }
    }

    for (const dep of step.dependsOn) {
      if (dep === step.id) {
        issues.push({ stepId: step.id, code: "self_dependency", ref: dep });
      } else if (!ids.has(dep)) {
        issues.push({ stepId: step.id, code: "unknown_dependency", ref: dep });
      }
    }
  }

  for (const id of stepsInCycles(steps)) {
    issues.push({ stepId: id, code: "dependency_cycle", ref: null });
  }

  const worst = highestRisk(resolved);
  const requiresApproval =
    resolved.some((t) => t.requiresApproval || t.reversibility === "irreversible") ||
    worst === "critical";

  return {
    stepCount: steps.length,
    highestRisk: worst,
    requiresApproval,
    irreversibleStepIds,
    compensatableStepIds,
    issues,
    sound: issues.length === 0,
  };
}

/**
 * The steps that could execute right now: still pending, and every step they depend on has succeeded. Returned
 * in ordinal order, so a runner walks a plan in its written order wherever the DAG allows a choice.
 */
export function nextExecutableSteps(steps: readonly PlanStepView[]): readonly PlanStepView[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  return steps
    .filter(
      (step) =>
        step.status === "pending" &&
        step.dependsOn.every((dep) => byId.get(dep)?.status === "succeeded"),
    )
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal);
}

/** How far through a plan execution has got. `percentSettled` is 100 for an empty plan — nothing is outstanding. */
export function planProgress(steps: readonly PlanStepView[]): PlanProgress {
  const count = (status: string): number => steps.filter((s) => s.status === status).length;
  const settled = steps.filter((s) => isSettledStepStatus(s.status)).length;
  const total = steps.length;
  return {
    total,
    succeeded: count("succeeded"),
    failed: count("failed"),
    skipped: count("skipped"),
    compensated: count("compensated"),
    outstanding: total - settled,
    percentSettled: total === 0 ? 100 : Math.round((settled * 100 * 100) / total) / 100,
    complete: total === settled,
  };
}
