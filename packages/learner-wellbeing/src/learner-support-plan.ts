import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptySupportEntryError, SupportGoalNotFoundError } from "./errors";
import {
  EMPTY_REVIEW_SCHEDULE,
  type ReviewSchedule,
  type SupportGoal,
  type SupportGoalStatus,
  type SupportPlanStatus,
} from "./support-plan";

/**
 * A learner's personalized support plan — the individual education / inclusion plan that
 * carries academic and medical accommodations, behaviour interventions, inclusion
 * strategies, personalized goals and a review schedule. One per student; integrates with
 * Student Lifecycle and Academics through the SupportPlanUpdated event. The learner is a
 * P2-D03 Student; the plan derives its organization from the student.
 */
export interface LearnerSupportPlan {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly status: SupportPlanStatus;
  readonly academicAccommodations: readonly string[];
  readonly medicalAccommodations: readonly string[];
  readonly behaviourInterventions: readonly string[];
  readonly inclusionStrategies: readonly string[];
  readonly goals: readonly SupportGoal[];
  readonly reviewSchedule: ReviewSchedule;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateLearnerSupportPlanParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
}

/** Create a new, empty support plan for a learner. */
export function createLearnerSupportPlan(
  params: CreateLearnerSupportPlanParams,
): LearnerSupportPlan {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    studentId: params.studentId,
    status: "active",
    academicAccommodations: [],
    medicalAccommodations: [],
    behaviourInterventions: [],
    inclusionStrategies: [],
    goals: [],
    reviewSchedule: EMPTY_REVIEW_SCHEDULE,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  plan: LearnerSupportPlan,
  patch: Partial<LearnerSupportPlan>,
): LearnerSupportPlan => ({ ...plan, ...patch, updatedAt: nowIso() });

const normalizeList = (items: readonly string[]): string[] => [
  ...new Set(items.map((i) => i.trim()).filter((i) => i.length > 0)),
];

/** Set the academic accommodations (trimmed, non-empty, deduplicated). */
export const setAcademicAccommodations = (
  plan: LearnerSupportPlan,
  items: readonly string[],
): LearnerSupportPlan => touch(plan, { academicAccommodations: normalizeList(items) });

/** Set the medical accommodations (trimmed, non-empty, deduplicated). */
export const setMedicalAccommodations = (
  plan: LearnerSupportPlan,
  items: readonly string[],
): LearnerSupportPlan => touch(plan, { medicalAccommodations: normalizeList(items) });

/** Set the behaviour interventions (trimmed, non-empty, deduplicated). */
export const setBehaviourInterventions = (
  plan: LearnerSupportPlan,
  items: readonly string[],
): LearnerSupportPlan => touch(plan, { behaviourInterventions: normalizeList(items) });

/** Set the inclusion strategies (trimmed, non-empty, deduplicated). */
export const setInclusionStrategies = (
  plan: LearnerSupportPlan,
  items: readonly string[],
): LearnerSupportPlan => touch(plan, { inclusionStrategies: normalizeList(items) });

export interface AddSupportGoalInput {
  readonly description: string;
  readonly targetDate?: string | null;
}

/** Add a personalized support goal; returns it. */
export function addSupportGoal(
  plan: LearnerSupportPlan,
  input: AddSupportGoalInput,
): { plan: LearnerSupportPlan; goal: SupportGoal } {
  const description = input.description.trim();
  if (description.length === 0) {
    throw new EmptySupportEntryError("goal description");
  }
  const goal: SupportGoal = {
    id: newUuid(),
    description,
    status: "active",
    targetDate: input.targetDate?.trim() || null,
    setAt: nowIso(),
  };
  return { plan: touch(plan, { goals: [...plan.goals, goal] }), goal };
}

/** Update a support goal's status. */
export function updateSupportGoalStatus(
  plan: LearnerSupportPlan,
  goalId: Uuid,
  status: SupportGoalStatus,
): LearnerSupportPlan {
  if (!plan.goals.some((g) => g.id === goalId)) {
    throw new SupportGoalNotFoundError(goalId);
  }
  return touch(plan, {
    goals: plan.goals.map((g) => (g.id === goalId ? { ...g, status } : g)),
  });
}

/** Remove a support goal by id. */
export function removeSupportGoal(plan: LearnerSupportPlan, goalId: Uuid): LearnerSupportPlan {
  if (!plan.goals.some((g) => g.id === goalId)) {
    throw new SupportGoalNotFoundError(goalId);
  }
  return touch(plan, { goals: plan.goals.filter((g) => g.id !== goalId) });
}

export interface SetReviewScheduleInput {
  readonly frequency?: string | null;
  readonly nextReviewOn?: string | null;
}

/** Set the review cadence and next review date. */
export function setReviewSchedule(
  plan: LearnerSupportPlan,
  input: SetReviewScheduleInput,
): LearnerSupportPlan {
  return touch(plan, {
    reviewSchedule: {
      ...plan.reviewSchedule,
      frequency: input.frequency?.trim() || null,
      nextReviewOn: input.nextReviewOn?.trim() || null,
    },
  });
}

/** Record that a review took place on the given date (defaults to today). */
export function recordReview(plan: LearnerSupportPlan, reviewedOn?: string): LearnerSupportPlan {
  return touch(plan, {
    reviewSchedule: {
      ...plan.reviewSchedule,
      lastReviewedOn: reviewedOn?.trim() || nowIso().slice(0, 10),
    },
  });
}

/** Archive the plan (no longer active). */
export const archiveSupportPlan = (plan: LearnerSupportPlan): LearnerSupportPlan =>
  touch(plan, { status: "archived" });

/** Reactivate an archived plan. */
export const activateSupportPlan = (plan: LearnerSupportPlan): LearnerSupportPlan =>
  touch(plan, { status: "active" });
