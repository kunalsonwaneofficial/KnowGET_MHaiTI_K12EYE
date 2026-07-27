import {
  isActingStageKind,
  isSettledStageRunStatus,
  isWithinAutoExecutionRisk,
  riskRank,
  toRate,
} from "./decision-value";
import type { RiskLevel } from "./decision-value";
import type {
  InstanceProgress,
  OverdueStage,
  StageRunView,
  WorkflowInspection,
  WorkflowIssue,
  WorkflowIssueCode,
  WorkflowStageView,
} from "./decision-view";

/**
 * The workflow orchestration engine — what a definition amounts to before it is published, and where a running
 * instance has got to.
 *
 * A workflow definition is a DAG, not a list. `ordinal` is reading order for a human; `dependsOn` is the real
 * order, and the two are allowed to disagree. That is the whole reason inspection exists: a definition is
 * checked *before* publication, because instances running under a published version must keep meaning what they
 * meant when they started, and there is no way to repair a cycle in a workflow that is already carrying live
 * cases.
 *
 * Two of the issue codes deserve their distinction. `dependency_cycle` marks the stages that are actually in a
 * loop — the bug. `unreachable_stage` marks the stages that are merely downstream of one, or downstream of a
 * dependency that does not exist — the blast radius. An author fixing a definition needs to know which is which,
 * so the engine reports both rather than collapsing them into "broken".
 *
 * Cycle detection settles layer by layer and reports what fails to settle, exactly as the evidence engine does.
 * Nothing recurses, so no definition — however tangled — can hang the inspection that is supposed to catch it.
 *
 * The engine is clock-free. `overdueStages` is the one place time matters and it takes the moment to judge
 * against as `asOf`, so a test never waits for a clock and two callers judging the same instant always agree.
 */

const MS_PER_HOUR = 3_600_000;

/** The stage-run statuses that release the stages depending on them. A failure releases nothing. */
const SATISFYING_STAGE_RUN_STATUSES: readonly string[] = ["completed", "skipped"];

/** Build an issue with the null-defaults spelled out, so every construction site reads the same. */
const issue = (
  code: WorkflowIssueCode,
  stageKey: string | null = null,
  ref: string | null = null,
): WorkflowIssue => ({ stageKey, code, ref });

/** Order issues deterministically: by code, then by the stage that carries it, then by what it refers to. */
const compareIssues = (a: WorkflowIssue, b: WorkflowIssue): number =>
  a.code.localeCompare(b.code) ||
  (a.stageKey ?? "").localeCompare(b.stageKey ?? "") ||
  (a.ref ?? "").localeCompare(b.ref ?? "");

/** Reading order: ordinal first, key as the tie-break, so equal ordinals still order deterministically. */
const byOrdinalThenKey = (a: WorkflowStageView, b: WorkflowStageView): number =>
  a.ordinal - b.ordinal || a.key.localeCompare(b.key);

/** Whether a stage declares the way back from what it does. */
const hasDeclaredCompensation = (stage: WorkflowStageView): boolean =>
  stage.reversibility === "reversible" ||
  (stage.reversibility === "compensatable" && stage.compensationKey !== null);

/**
 * Whether a stage could ever run with no person involved. The same three conditions the autonomy engine applies
 * to a rule, applied to a stage: it must actually be an acting stage, its risk must sit at or below the
 * auto-execution ceiling, and the way back from it must be declared.
 */
export const isAutoExecutableStage = (stage: WorkflowStageView): boolean =>
  isActingStageKind(stage.kind) &&
  isWithinAutoExecutionRisk(stage.riskLevel) &&
  hasDeclaredCompensation(stage);

/**
 * Whether a stage will always stop for a person: a human task and a decision gate do so by definition, and an
 * acting stage does so whenever it cannot clear the autonomy gate on its own.
 */
export const isHumanGatedStage = (stage: WorkflowStageView): boolean =>
  stage.kind === "human_task" ||
  stage.kind === "decision" ||
  (isActingStageKind(stage.kind) && !isAutoExecutableStage(stage));

/**
 * Settle a dependency depth for every stage whose dependencies all resolve and lead nowhere circular. Stages
 * with no dependencies are depth 1. The pass repeats while it makes progress; a stage on a cycle, or downstream
 * of one, or depending on a stage that does not exist, never settles and is simply absent from the result.
 * Self-dependencies are excluded from the calculation and reported separately.
 */
function settleStageDepths(
  stages: readonly WorkflowStageView[],
  known: ReadonlySet<string>,
): ReadonlyMap<string, number> {
  const depths = new Map<string, number>();
  let progressed = true;

  while (progressed) {
    progressed = false;
    for (const stage of stages) {
      if (depths.has(stage.key)) {
        continue;
      }
      const dependencies = stage.dependsOn.filter((key) => key !== stage.key);
      if (
        dependencies.every((key) => depths.has(key)) &&
        dependencies.every((key) => known.has(key))
      ) {
        const deepest = dependencies.reduce((max, key) => Math.max(max, depths.get(key) ?? 0), 0);
        depths.set(stage.key, deepest + 1);
        progressed = true;
      }
    }
  }

  return depths;
}

/**
 * Which of the unsettled stages are actually *in* a loop, as opposed to merely stuck behind one. A stage is on a
 * cycle when it can reach itself by following dependencies through other unsettled stages. The walk is breadth
 * first over a finite visited set, so a tangle of any shape terminates.
 */
function stagesOnCycle(unsettled: readonly WorkflowStageView[]): ReadonlySet<string> {
  const unsettledKeys = new Set(unsettled.map((stage) => stage.key));
  const dependencies = new Map<string, readonly string[]>(
    unsettled.map(
      (stage) =>
        [
          stage.key,
          stage.dependsOn.filter((key) => unsettledKeys.has(key) && key !== stage.key),
        ] as const,
    ),
  );
  const onCycle = new Set<string>();

  for (const start of unsettledKeys) {
    const seen = new Set<string>();
    const queue = [...(dependencies.get(start) ?? [])];
    while (queue.length > 0) {
      const next = queue.shift();
      if (next === undefined || seen.has(next)) {
        continue;
      }
      seen.add(next);
      if (next === start) {
        break;
      }
      queue.push(...(dependencies.get(next) ?? []));
    }
    if (seen.has(start)) {
      onCycle.add(start);
    }
  }

  return onCycle;
}

/**
 * Inspect a workflow definition before it is published: how big it is, the worst risk in it, which stages could
 * ever run unattended, which will always stop for a person, what cannot be undone, and everything structurally
 * wrong with it.
 *
 * A definition with any issue at all is not `sound`, and an unsound definition must not be published. There is
 * no severity ranking here on purpose — an author fixes every issue, because each one is a way for a live
 * instance to reach a state nobody designed.
 */
export function inspectWorkflow(stages: readonly WorkflowStageView[]): WorkflowInspection {
  const issues: WorkflowIssue[] = [];

  if (stages.length === 0) {
    issues.push(issue("empty_workflow"));
  }

  const seenKeys = new Set<string>();
  const seenOrdinals = new Set<number>();
  for (const stage of stages) {
    if (seenKeys.has(stage.key)) {
      issues.push(issue("duplicate_stage_key", stage.key));
    }
    seenKeys.add(stage.key);

    if (seenOrdinals.has(stage.ordinal)) {
      issues.push(issue("duplicate_ordinal", stage.key, String(stage.ordinal)));
    }
    seenOrdinals.add(stage.ordinal);
  }

  for (const stage of stages) {
    for (const dependency of stage.dependsOn) {
      if (dependency === stage.key) {
        issues.push(issue("self_dependency", stage.key, stage.key));
      } else if (!seenKeys.has(dependency)) {
        issues.push(issue("unknown_dependency", stage.key, dependency));
      }
    }

    if (isActingStageKind(stage.kind) && stage.capabilityKey === null) {
      issues.push(issue("missing_capability", stage.key));
    }
    if (!isActingStageKind(stage.kind) && stage.capabilityKey !== null) {
      issues.push(issue("capability_on_non_acting_stage", stage.key, stage.capabilityKey));
    }
    if (stage.reversibility === "compensatable" && stage.compensationKey === null) {
      issues.push(issue("missing_compensation", stage.key));
    }
  }

  const depths = settleStageDepths(stages, seenKeys);
  const unsettled = stages.filter((stage) => !depths.has(stage.key));
  const onCycle = stagesOnCycle(unsettled);
  for (const stage of unsettled) {
    issues.push(
      issue(onCycle.has(stage.key) ? "dependency_cycle" : "unreachable_stage", stage.key),
    );
  }

  const sortedIssues = [...issues].sort(compareIssues);

  return {
    stageCount: stages.length,
    highestRisk: stages.reduce<RiskLevel | null>(
      (worst, stage) =>
        worst === null || riskRank(stage.riskLevel) > riskRank(worst) ? stage.riskLevel : worst,
      null,
    ),
    autoExecutableStageKeys: [...stages]
      .sort(byOrdinalThenKey)
      .filter(isAutoExecutableStage)
      .map((stage) => stage.key),
    approvalGatedStageKeys: [...stages]
      .sort(byOrdinalThenKey)
      .filter(isHumanGatedStage)
      .map((stage) => stage.key),
    irreversibleStageKeys: [...stages]
      .sort(byOrdinalThenKey)
      .filter((stage) => stage.reversibility === "irreversible")
      .map((stage) => stage.key),
    compensatableStageKeys: [...stages]
      .sort(byOrdinalThenKey)
      .filter((stage) => stage.reversibility === "compensatable")
      .map((stage) => stage.key),
    issues: sortedIssues,
    sound: sortedIssues.length === 0,
  };
}

/** Whether a definition may be published at all. */
export const isPublishableWorkflow = (stages: readonly WorkflowStageView[]): boolean =>
  inspectWorkflow(stages).sound;

/** The distinct issue codes an inspection reports, sorted — the shape an event or a UI badge wants. */
export const workflowIssueCodes = (inspection: WorkflowInspection): readonly WorkflowIssueCode[] =>
  [...new Set(inspection.issues.map((entry) => entry.code))].sort((a, b) => a.localeCompare(b));

/**
 * The stages of a sound definition grouped into the layers they may run in: everything in layer one may begin
 * at once, everything in layer two once layer one has settled, and so on. Stages on a cycle or stranded behind
 * one are absent — a definition carrying either is not publishable in the first place.
 */
export function stageExecutionLayers(
  stages: readonly WorkflowStageView[],
): readonly (readonly string[])[] {
  const depths = settleStageDepths(stages, new Set(stages.map((stage) => stage.key)));
  const deepest = [...depths.values()].reduce((max, depth) => Math.max(max, depth), 0);

  return Array.from({ length: deepest }, (_unused, index) =>
    [...stages]
      .filter((stage) => depths.get(stage.key) === index + 1)
      .sort(byOrdinalThenKey)
      .map((stage) => stage.key),
  );
}

/** How far through a workflow instance execution has got. */
export function instanceProgress(runs: readonly StageRunView[]): InstanceProgress {
  const countOf = (status: string): number => runs.filter((run) => run.status === status).length;
  const settled = runs.filter((run) => isSettledStageRunStatus(run.status)).length;
  const outstanding = runs.length - settled;

  return {
    total: runs.length,
    completed: countOf("completed"),
    skipped: countOf("skipped"),
    failed: countOf("failed"),
    compensated: countOf("compensated"),
    outstanding,
    percentSettled: toRate(settled, runs.length),
    complete: runs.length > 0 && outstanding === 0,
  };
}

/**
 * The stages that may begin right now: pending, and with every dependency either completed or skipped. A
 * *failed* dependency releases nothing — the instance stops there rather than carrying on past the part that
 * did not work, which is the difference between an orchestrator and a queue.
 */
export function readyStageKeys(
  stages: readonly WorkflowStageView[],
  runs: readonly StageRunView[],
): readonly string[] {
  const statusByKey = new Map(runs.map((run) => [run.stageKey, run.status] as const));
  const satisfied = (key: string): boolean => {
    const status = statusByKey.get(key);
    return status !== undefined && SATISFYING_STAGE_RUN_STATUSES.includes(status);
  };

  return [...stages]
    .filter((stage) => statusByKey.get(stage.key) === "pending")
    .filter((stage) => stage.dependsOn.every(satisfied))
    .sort(byOrdinalThenKey)
    .map((stage) => stage.key);
}

/**
 * The stages that have been active longer than their SLA allows, worst first. Only an *active* stage can be
 * overdue: a pending stage has not started its clock, and a settled one has stopped it.
 */
export function overdueStages(
  stages: readonly WorkflowStageView[],
  runs: readonly StageRunView[],
  asOf: string,
): readonly OverdueStage[] {
  const at = Date.parse(asOf);
  if (Number.isNaN(at)) {
    return [];
  }

  const stageByKey = new Map(stages.map((stage) => [stage.key, stage] as const));
  const overdue: OverdueStage[] = [];

  for (const run of runs) {
    const stage = stageByKey.get(run.stageKey);
    if (run.status !== "active" || run.startedAt === null || stage === undefined) {
      continue;
    }
    const { slaHours } = stage;
    const startedAt = Date.parse(run.startedAt);
    if (slaHours === null || Number.isNaN(startedAt)) {
      continue;
    }
    const elapsedHours = (at - startedAt) / MS_PER_HOUR;
    if (elapsedHours <= slaHours) {
      continue;
    }
    overdue.push({
      stageKey: stage.key,
      slaHours,
      overdueByHours: Math.floor(elapsedHours - slaHours),
    });
  }

  return overdue.sort(
    (a, b) => b.overdueByHours - a.overdueByHours || a.stageKey.localeCompare(b.stageKey),
  );
}
