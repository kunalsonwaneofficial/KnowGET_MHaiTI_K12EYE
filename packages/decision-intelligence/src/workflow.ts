import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  type Reversibility,
  type RiskLevel,
  type StageKind,
  type WorkflowStatus,
  type WorkflowTrigger,
  normalizeCapabilityKey,
  normalizeSignalKey,
  normalizeStageKey,
  normalizeWorkflowKey,
} from "./decision-value";
import type { WorkflowInspection, WorkflowStageView } from "./decision-view";
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
import { inspectWorkflow, workflowIssueCodes } from "./orchestration";

/**
 * A workflow definition version — the shape of a process the institution runs, and the one thing in this domain
 * that is deliberately frozen.
 *
 * **A published version is immutable.** Not by convention, but because every edit is refused: {@link addStage},
 * {@link removeStage}, {@link replaceStages} and {@link amendWorkflow} all throw once the version has left draft.
 * The reason is the instances. A live case that has already passed stage four cannot be told that stage four now
 * depends on stage six, and no amount of migration logic makes that coherent after the fact. So a change to a
 * published process is a *new version* — {@link reviseWorkflow} produces one — and the running instances keep
 * meaning what they meant when they started.
 *
 * **Publication is the gate.** {@link publishWorkflow} runs the orchestration engine's inspection and refuses
 * anything with a structural issue: a dependency cycle, a dangling dependency, an acting stage that names no
 * capability, a compensatable stage that names no way back. A draft is allowed to be broken — that is what a
 * draft is for — but the moment live cases can enter it, it must be sound. This is also where the contract's
 * third rule reaches the workflow layer: `missing_compensation` is an inspection issue, so a process containing
 * an automated action that cannot be undone cannot be published at all.
 *
 * The stages form a **DAG, not a list**. `ordinal` is reading order for a person; `dependsOn` is the real order,
 * and the two are allowed to disagree. Removing a stage deliberately leaves any dependency on it dangling rather
 * than quietly rewriting other stages — the author is shown `unknown_dependency` at the gate instead of having
 * their process silently rewired underneath them.
 *
 * `draft → published ⇄ suspended → retired`, and `draft → retired` for a version that never went live. A
 * suspension is reversible and a retirement is not, because "stop starting new cases for a moment" and "this
 * process is over" are different operational statements and collapsing them loses the difference.
 */

// --- Stages ----------------------------------------------------------------------

/**
 * One stage of a workflow definition. Structurally a superset of the orchestration engine's `WorkflowStageView`,
 * so the engines read a definition's stages directly rather than through a projection — the definition adds only
 * what a record needs and an engine does not: the human name and the role a human task falls to.
 */
export interface WorkflowStage {
  readonly key: string;
  readonly name: string;
  /** Reading order for a person. The real order is {@link WorkflowStage.dependsOn}. */
  readonly ordinal: number;
  readonly kind: StageKind;
  /** The capability (P2-D26 catalog) an `automated_action` stage requests. Null for every other kind. */
  readonly capabilityKey: string | null;
  readonly riskLevel: RiskLevel;
  readonly reversibility: Reversibility;
  /** The capability that undoes this stage. Required when `reversibility` is `compensatable`. */
  readonly compensationKey: string | null;
  /** Keys of stages that must complete or be skipped before this one may begin. */
  readonly dependsOn: readonly string[];
  /** Hours after the stage begins at which it is overdue. Null when the stage carries no SLA. */
  readonly slaHours: number | null;
  /** The role a `human_task` or `decision` stage falls to. Opaque here — P2-D01-M02 owns roles. */
  readonly assigneeRole: string | null;
  readonly optional: boolean;
}

export interface DefineStageParams {
  readonly key: string;
  readonly name: string;
  readonly ordinal: number;
  readonly kind: StageKind;
  readonly capabilityKey?: string | null;
  readonly riskLevel: RiskLevel;
  readonly reversibility: Reversibility;
  readonly compensationKey?: string | null;
  readonly dependsOn?: readonly string[];
  readonly slaHours?: number | null;
  readonly assigneeRole?: string | null;
  readonly optional?: boolean;
}

/** De-duplicate dependencies and drop blanks, so a stage's shape does not depend on how it was typed in. */
const normalizeDependsOn = (dependsOn: readonly string[] | undefined): readonly string[] => [
  ...new Set((dependsOn ?? []).map(normalizeStageKey).filter((key) => key.length > 0)),
];

/** An optional capability-style key, normalized to the shared grammar or dropped entirely. */
const optionalCapabilityKey = (key: string | null | undefined): string | null => {
  const normalized = normalizeCapabilityKey(key ?? "");
  return normalized.length === 0 ? null : normalized;
};

/**
 * Define a stage. Defining is separate from adding it so a whole set of stages can be *wired* before any of them
 * is attached — a dependency names a stage key, and the keys have to exist as values before they can be pointed
 * at.
 */
export function defineStage(params: DefineStageParams): WorkflowStage {
  const key = normalizeStageKey(params.key);
  if (key.length === 0) {
    throw new EmptyStageKeyError();
  }

  const name = params.name.trim();
  if (name.length === 0) {
    throw new EmptyStageNameError();
  }

  return {
    key,
    name,
    ordinal: params.ordinal,
    kind: params.kind,
    capabilityKey: optionalCapabilityKey(params.capabilityKey),
    riskLevel: params.riskLevel,
    reversibility: params.reversibility,
    compensationKey: optionalCapabilityKey(params.compensationKey),
    dependsOn: normalizeDependsOn(params.dependsOn),
    slaHours: params.slaHours ?? null,
    assigneeRole: params.assigneeRole?.trim() || null,
    optional: params.optional ?? false,
  };
}

// --- The aggregate ---------------------------------------------------------------

export interface WorkflowDefinition {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** Stable across versions — this is what an automation rule or a signal names. */
  readonly key: string;
  readonly version: number;
  readonly name: string;
  readonly description: string | null;
  readonly trigger: WorkflowTrigger;
  /** The observed signal that starts this workflow. Non-null exactly when `trigger` is `signal`. */
  readonly triggerSignalKey: string | null;
  readonly status: WorkflowStatus;
  readonly stages: readonly WorkflowStage[];
  readonly publishedAt: ISODateString | null;
  readonly publishedByUserId: string | null;
  readonly retiredAt: ISODateString | null;
  readonly createdByUserId: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateWorkflowParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly key: string;
  readonly name: string;
  readonly description?: string | null;
  readonly trigger: WorkflowTrigger;
  readonly triggerSignalKey?: string | null;
  readonly version?: number;
  readonly stages?: readonly WorkflowStage[];
  readonly createdByUserId?: string | null;
}

/**
 * A signal-triggered workflow names its signal and nothing else does. Both halves are checked, because a manual
 * workflow that also carries a signal key is ambiguous about what starts it, and an orchestrator guessing at
 * that is how a process ends up running twice.
 */
function requireCoherentTrigger(trigger: WorkflowTrigger, signalKey: string | null): string | null {
  if (trigger === "signal") {
    if (signalKey === null) {
      throw new WorkflowTriggerSignalMissingError();
    }
    return signalKey;
  }
  if (signalKey !== null) {
    throw new WorkflowTriggerSignalNotAllowedError(trigger);
  }
  return null;
}

/** Normalize a supplied trigger signal to the shared key grammar, or to nothing at all. */
const optionalSignalKey = (key: string | null | undefined): string | null => {
  const normalized = normalizeSignalKey(key ?? "");
  return normalized.length === 0 ? null : normalized;
};

/** Refuse two stages answering to one key, at the point the mistake is made rather than at the gate. */
function requireDistinctStageKeys(stages: readonly WorkflowStage[]): readonly WorkflowStage[] {
  const seen = new Set<string>();
  for (const stage of stages) {
    if (seen.has(stage.key)) {
      throw new DuplicateStageKeyError(stage.key);
    }
    seen.add(stage.key);
  }
  return stages;
}

/** Raise a new workflow definition version. Always a draft: publication is a separate, gated act. */
export function createWorkflow(params: CreateWorkflowParams): WorkflowDefinition {
  const key = normalizeWorkflowKey(params.key);
  if (key.length === 0) {
    throw new EmptyWorkflowKeyError();
  }

  const name = params.name.trim();
  if (name.length === 0) {
    throw new EmptyWorkflowNameError();
  }

  const now = nowIso();

  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    key,
    version: params.version ?? 1,
    name,
    description: params.description?.trim() || null,
    trigger: params.trigger,
    triggerSignalKey: requireCoherentTrigger(
      params.trigger,
      optionalSignalKey(params.triggerSignalKey),
    ),
    status: "draft",
    stages: [...requireDistinctStageKeys(params.stages ?? [])],
    publishedAt: null,
    publishedByUserId: null,
    retiredAt: null,
    createdByUserId: params.createdByUserId ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

// --- Editing a draft -------------------------------------------------------------

/** Every change stamps the moment it happened; nothing in this aggregate mutates in place. */
const touch = (
  workflow: WorkflowDefinition,
  patch: Partial<WorkflowDefinition>,
): WorkflowDefinition => ({ ...workflow, ...patch, updatedAt: nowIso() });

/**
 * The immutability rule, in one place. Every edit passes through here, so there is no route by which a published
 * version changes shape — including one added later by someone who did not read this file.
 */
function requireDraft(workflow: WorkflowDefinition): void {
  if (workflow.status !== "draft") {
    throw new PublishedWorkflowImmutableError(workflow.id, workflow.status);
  }
}

export interface AmendWorkflowParams {
  readonly name?: string;
  readonly description?: string | null;
  readonly trigger?: WorkflowTrigger;
  readonly triggerSignalKey?: string | null;
}

/** Amend a draft's description of itself — what it is called, what it is for, and what starts it. */
export function amendWorkflow(
  workflow: WorkflowDefinition,
  params: AmendWorkflowParams,
): WorkflowDefinition {
  requireDraft(workflow);

  const name = params.name === undefined ? workflow.name : params.name.trim();
  if (name.length === 0) {
    throw new EmptyWorkflowNameError();
  }

  const trigger = params.trigger ?? workflow.trigger;
  const signalKey =
    params.triggerSignalKey === undefined
      ? workflow.triggerSignalKey
      : optionalSignalKey(params.triggerSignalKey);

  return touch(workflow, {
    name,
    description:
      params.description === undefined ? workflow.description : params.description?.trim() || null,
    trigger,
    triggerSignalKey: requireCoherentTrigger(trigger, signalKey),
  });
}

/** Add a stage to a draft. */
export function addStage(
  workflow: WorkflowDefinition,
  params: DefineStageParams,
): WorkflowDefinition {
  requireDraft(workflow);
  const stage = defineStage(params);

  return touch(workflow, {
    stages: requireDistinctStageKeys([...workflow.stages, stage]),
  });
}

/**
 * Remove a stage from a draft. Any dependency on it is left dangling on purpose: the author is shown an
 * `unknown_dependency` at the publication gate rather than having the rest of their process quietly rewired.
 */
export function removeStage(workflow: WorkflowDefinition, stageKey: string): WorkflowDefinition {
  requireDraft(workflow);
  const key = normalizeStageKey(stageKey);
  if (!workflow.stages.some((stage) => stage.key === key)) {
    throw new StageNotFoundError(workflow.id, key);
  }

  return touch(workflow, {
    stages: workflow.stages.filter((stage) => stage.key !== key),
  });
}

/** Replace a draft's stages wholesale — the shape a definition editor saves. */
export function replaceStages(
  workflow: WorkflowDefinition,
  stages: readonly WorkflowStage[],
): WorkflowDefinition {
  requireDraft(workflow);

  return touch(workflow, { stages: [...requireDistinctStageKeys(stages)] });
}

// --- Lifecycle -------------------------------------------------------------------

export interface PublishWorkflowParams {
  readonly publishedByUserId?: string | null;
}

/**
 * Publish a draft, after the orchestration engine has inspected it.
 *
 * The inspection is not advisory. A definition carrying any issue at all is refused, and the issue codes come
 * straight back to the caller so an author is told precisely what to fix. This is the last moment the process
 * can be corrected cheaply — after this, cases are running inside it.
 */
export function publishWorkflow(
  workflow: WorkflowDefinition,
  params: PublishWorkflowParams = {},
): WorkflowDefinition {
  if (workflow.status !== "draft") {
    throw new InvalidWorkflowTransitionError(workflow.status, "published");
  }

  const inspection = inspectWorkflow(toWorkflowStageViews(workflow));
  if (!inspection.sound) {
    throw new UnsoundWorkflowError(workflow.id, workflowIssueCodes(inspection));
  }

  return touch(workflow, {
    status: "published",
    publishedAt: nowIso(),
    publishedByUserId: params.publishedByUserId ?? null,
  });
}

/** Stop starting new cases for a while. Reversible — that is the whole difference from retirement. */
export function suspendWorkflow(workflow: WorkflowDefinition): WorkflowDefinition {
  if (workflow.status !== "published") {
    throw new InvalidWorkflowTransitionError(workflow.status, "suspended");
  }

  return touch(workflow, { status: "suspended" });
}

/** Start accepting cases again. */
export function resumeWorkflow(workflow: WorkflowDefinition): WorkflowDefinition {
  if (workflow.status !== "suspended") {
    throw new InvalidWorkflowTransitionError(workflow.status, "published");
  }

  return touch(workflow, { status: "published" });
}

/** This process is over. Terminal — a retired version never carries a case again. */
export function retireWorkflow(workflow: WorkflowDefinition): WorkflowDefinition {
  if (workflow.status === "retired") {
    throw new InvalidWorkflowTransitionError(workflow.status, "retired");
  }

  return touch(workflow, { status: "retired", retiredAt: nowIso() });
}

export interface ReviseWorkflowParams {
  readonly createdByUserId?: string | null;
}

/**
 * The way a published process changes: a fresh draft at the next version number, carrying the same key and the
 * same stages, free to be edited. The published version it came from is untouched, so the instances running
 * under it are untouched too — which is the entire point of versioning a workflow rather than editing one.
 */
export function reviseWorkflow(
  workflow: WorkflowDefinition,
  params: ReviseWorkflowParams = {},
): WorkflowDefinition {
  return createWorkflow({
    tenantId: workflow.tenantId,
    organizationId: workflow.organizationId,
    key: workflow.key,
    name: workflow.name,
    description: workflow.description,
    trigger: workflow.trigger,
    triggerSignalKey: workflow.triggerSignalKey,
    version: workflow.version + 1,
    stages: workflow.stages,
    createdByUserId: params.createdByUserId ?? workflow.createdByUserId,
  });
}

// --- Reading ---------------------------------------------------------------------

/** Whether new cases may enter this version right now. */
export const canStartWorkflowInstance = (workflow: WorkflowDefinition): boolean =>
  workflow.status === "published";

/** Whether this version may still be edited. */
export const isWorkflowEditable = (workflow: WorkflowDefinition): boolean =>
  workflow.status === "draft";

/** A stage by key, or null when the definition does not have one. */
export const workflowStage = (
  workflow: WorkflowDefinition,
  stageKey: string,
): WorkflowStage | null =>
  workflow.stages.find((stage) => stage.key === normalizeStageKey(stageKey)) ?? null;

/** The stage keys of a definition, in reading order. */
export const workflowStageKeys = (workflow: WorkflowDefinition): readonly string[] =>
  [...workflow.stages]
    .sort((a, b) => a.ordinal - b.ordinal || a.key.localeCompare(b.key))
    .map((stage) => stage.key);

/** What the publication gate would say about this definition right now. */
export const inspectWorkflowDefinition = (workflow: WorkflowDefinition): WorkflowInspection =>
  inspectWorkflow(toWorkflowStageViews(workflow));

/** Whether this definition would pass the publication gate as it stands. */
export const isWorkflowSound = (workflow: WorkflowDefinition): boolean =>
  inspectWorkflowDefinition(workflow).sound;

// --- Engine views ----------------------------------------------------------------

/** The definition as the orchestration and reversal engines read it. */
export const toWorkflowStageViews = (workflow: WorkflowDefinition): readonly WorkflowStageView[] =>
  workflow.stages;
