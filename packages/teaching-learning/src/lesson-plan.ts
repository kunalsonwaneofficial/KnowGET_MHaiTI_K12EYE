import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyLessonPlanFieldError, LessonPlanArchivedError, LessonPlanStateError } from "./errors";
import type { LessonPlanRevision, LessonPlanStatus } from "./lesson-plan-value";

/**
 * A lesson plan — the design of a single lesson: objectives, the outcomes it targets, teaching
 * strategies, learning activities, assessment checkpoints, required resources, differentiation
 * strategies and reflection notes. It is version-controlled (a counter plus an append-only
 * revision log) and runs a review-and-approval workflow: draft → in_review → approved, with an
 * approved plan revised back to draft at the next version. Content is editable only while a
 * draft or in review; an archived plan is immutable. Structurally satisfies the intelligence
 * engine's lesson-plan view.
 */
export interface LessonPlan {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly subjectId: Uuid;
  readonly unitPlanId: Uuid | null;
  readonly title: string;
  readonly objectives: readonly string[];
  readonly learningOutcomeIds: readonly Uuid[];
  readonly teachingStrategies: readonly string[];
  readonly learningActivities: readonly string[];
  readonly assessmentCheckpoints: readonly string[];
  readonly requiredResourceIds: readonly Uuid[];
  readonly differentiationStrategies: readonly string[];
  readonly reflectionNotes: string | null;
  readonly version: number;
  readonly status: LessonPlanStatus;
  readonly revisions: readonly LessonPlanRevision[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateLessonPlanParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly subjectId: Uuid;
  readonly unitPlanId?: Uuid | null;
  readonly title: string;
  readonly objectives?: readonly string[];
  readonly learningOutcomeIds?: readonly Uuid[];
  readonly teachingStrategies?: readonly string[];
  readonly learningActivities?: readonly string[];
  readonly assessmentCheckpoints?: readonly string[];
  readonly requiredResourceIds?: readonly Uuid[];
  readonly differentiationStrategies?: readonly string[];
  readonly reflectionNotes?: string | null;
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyLessonPlanFieldError(field);
  }
  return trimmed;
};

const touch = (plan: LessonPlan, patch: Partial<LessonPlan>): LessonPlan => ({
  ...plan,
  ...patch,
  updatedAt: nowIso(),
});

/** Content is editable only while a draft or in review — not once approved or archived. */
const assertContentEditable = (plan: LessonPlan): void => {
  if (plan.status === "archived") {
    throw new LessonPlanArchivedError(plan.id);
  }
  if (plan.status !== "draft" && plan.status !== "in_review") {
    throw new LessonPlanStateError(plan.id, "draft or in_review", plan.status);
  }
};

/** Create a new draft lesson plan at version 1. */
export function createLessonPlan(params: CreateLessonPlanParams): LessonPlan {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    subjectId: params.subjectId,
    unitPlanId: params.unitPlanId ?? null,
    title: requireText(params.title, "title"),
    objectives: params.objectives ? [...params.objectives] : [],
    learningOutcomeIds: params.learningOutcomeIds ? [...params.learningOutcomeIds] : [],
    teachingStrategies: params.teachingStrategies ? [...params.teachingStrategies] : [],
    learningActivities: params.learningActivities ? [...params.learningActivities] : [],
    assessmentCheckpoints: params.assessmentCheckpoints ? [...params.assessmentCheckpoints] : [],
    requiredResourceIds: params.requiredResourceIds ? [...params.requiredResourceIds] : [],
    differentiationStrategies: params.differentiationStrategies
      ? [...params.differentiationStrategies]
      : [],
    reflectionNotes: params.reflectionNotes?.trim() || null,
    version: 1,
    status: "draft",
    revisions: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Rename the lesson. Editable only while a draft or in review. */
export function renameLessonPlan(plan: LessonPlan, title: string): LessonPlan {
  assertContentEditable(plan);
  return touch(plan, { title: requireText(title, "title") });
}

/** Replace the lesson's objectives. Editable only while a draft or in review. */
export function setLessonObjectives(plan: LessonPlan, objectives: readonly string[]): LessonPlan {
  assertContentEditable(plan);
  return touch(plan, { objectives: [...objectives] });
}

/** Replace the outcomes the lesson targets. Editable only while a draft or in review. */
export function setLessonOutcomes(plan: LessonPlan, outcomeIds: readonly Uuid[]): LessonPlan {
  assertContentEditable(plan);
  return touch(plan, { learningOutcomeIds: [...outcomeIds] });
}

/** Replace the lesson's teaching strategies. Editable only while a draft or in review. */
export function setLessonTeachingStrategies(
  plan: LessonPlan,
  strategies: readonly string[],
): LessonPlan {
  assertContentEditable(plan);
  return touch(plan, { teachingStrategies: [...strategies] });
}

/** Replace the lesson's learning activities. Editable only while a draft or in review. */
export function setLessonActivities(plan: LessonPlan, activities: readonly string[]): LessonPlan {
  assertContentEditable(plan);
  return touch(plan, { learningActivities: [...activities] });
}

/** Replace the lesson's assessment checkpoints. Editable only while a draft or in review. */
export function setLessonAssessmentCheckpoints(
  plan: LessonPlan,
  checkpoints: readonly string[],
): LessonPlan {
  assertContentEditable(plan);
  return touch(plan, { assessmentCheckpoints: [...checkpoints] });
}

/** Replace the resources the lesson requires. Editable only while a draft or in review. */
export function setLessonRequiredResources(
  plan: LessonPlan,
  resourceIds: readonly Uuid[],
): LessonPlan {
  assertContentEditable(plan);
  return touch(plan, { requiredResourceIds: [...resourceIds] });
}

/** Replace the lesson's differentiation strategies. Editable only while a draft or in review. */
export function setLessonDifferentiation(
  plan: LessonPlan,
  strategies: readonly string[],
): LessonPlan {
  assertContentEditable(plan);
  return touch(plan, { differentiationStrategies: [...strategies] });
}

/** Set (or clear) the lesson's reflection notes. Editable only while a draft or in review. */
export function setLessonReflectionNotes(plan: LessonPlan, notes: string | null): LessonPlan {
  assertContentEditable(plan);
  return touch(plan, { reflectionNotes: notes?.trim() || null });
}

/** Submit the lesson for review (draft → in_review). */
export function submitLessonForReview(plan: LessonPlan): LessonPlan {
  if (plan.status !== "draft") {
    throw new LessonPlanStateError(plan.id, "draft", plan.status);
  }
  return touch(plan, { status: "in_review" });
}

/** Approve the lesson (in_review → approved) — the version teachers deliver. */
export function approveLessonPlan(plan: LessonPlan): LessonPlan {
  if (plan.status !== "in_review") {
    throw new LessonPlanStateError(plan.id, "in_review", plan.status);
  }
  return touch(plan, { status: "approved" });
}

/** Send the lesson back for changes (in_review → draft). */
export function requestLessonChanges(plan: LessonPlan): LessonPlan {
  if (plan.status !== "in_review") {
    throw new LessonPlanStateError(plan.id, "in_review", plan.status);
  }
  return touch(plan, { status: "draft" });
}

/**
 * Revise an approved lesson — bump the version, append to the revision log, and return it to
 * draft for re-editing and re-approval, so the approved plan is always a known version.
 */
export function reviseLessonPlan(plan: LessonPlan, note: string): LessonPlan {
  if (plan.status !== "approved") {
    throw new LessonPlanStateError(plan.id, "approved", plan.status);
  }
  const version = plan.version + 1;
  const revision: LessonPlanRevision = {
    version,
    note: requireText(note, "revision note"),
    revisedAt: nowIso(),
  };
  return touch(plan, { version, status: "draft", revisions: [...plan.revisions, revision] });
}

/** Archive the lesson. Terminal — an archived lesson is immutable. */
export function archiveLessonPlan(plan: LessonPlan): LessonPlan {
  return touch(plan, { status: "archived" });
}
