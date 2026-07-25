import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyActivityTitleError,
  InvalidActivityHoursError,
  InvalidActivityTransitionError,
} from "./errors";
import type { ActivityStatus, PdCategory } from "./faculty-value";

/**
 * A professional-learning activity — a piece of CPD a staff member undertakes (a workshop, course,
 * certification, …) with a category and an hour value. It runs `planned → enrolled → completed |
 * cancelled`; only a **completed** activity earns hours toward the development ledger. Hours are
 * scoped to a period so completion counts toward that period's requirement.
 */
export interface ProfessionalLearningActivity {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly title: string;
  readonly category: PdCategory;
  readonly provider: string | null;
  readonly hours: number;
  readonly period: string;
  readonly startDate: string;
  readonly completedOn: string | null;
  readonly status: ActivityStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface PlanActivityParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly title: string;
  readonly category: PdCategory;
  readonly hours: number;
  readonly provider?: string | null;
  readonly period?: string;
  readonly startDate?: string | null;
}

const assertHours = (hours: number): void => {
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new InvalidActivityHoursError(hours);
  }
};

/** Plan a professional-learning activity (status `planned`). Title required; hours positive. */
export function planActivity(params: PlanActivityParams): ProfessionalLearningActivity {
  const title = params.title.trim();
  if (title.length === 0) {
    throw new EmptyActivityTitleError();
  }
  assertHours(params.hours);
  const now = nowIso();
  const startDate = params.startDate ?? now.slice(0, 10);
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    employeeId: params.employeeId,
    title,
    category: params.category,
    provider: params.provider?.trim() || null,
    hours: params.hours,
    period: params.period ?? startDate.slice(0, 4),
    startDate,
    completedOn: null,
    status: "planned",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  activity: ProfessionalLearningActivity,
  patch: Partial<ProfessionalLearningActivity>,
): ProfessionalLearningActivity => ({
  ...activity,
  ...patch,
  updatedAt: nowIso(),
});

/** Set the activity's hour value (while not yet completed/cancelled). */
export function setActivityHours(
  activity: ProfessionalLearningActivity,
  hours: number,
): ProfessionalLearningActivity {
  if (activity.status === "completed" || activity.status === "cancelled") {
    throw new InvalidActivityTransitionError(activity.status, "set_hours");
  }
  assertHours(hours);
  return touch(activity, { hours });
}

/** Enroll in a planned activity (→ `enrolled`). */
export function enrollActivity(
  activity: ProfessionalLearningActivity,
): ProfessionalLearningActivity {
  if (activity.status !== "planned") {
    throw new InvalidActivityTransitionError(activity.status, "enrolled");
  }
  return touch(activity, { status: "enrolled" });
}

/** Complete an activity, stamping the completion date — it now earns hours (→ `completed`). */
export function completeActivity(
  activity: ProfessionalLearningActivity,
  completedOn?: string | null,
): ProfessionalLearningActivity {
  if (activity.status !== "planned" && activity.status !== "enrolled") {
    throw new InvalidActivityTransitionError(activity.status, "completed");
  }
  return touch(activity, {
    status: "completed",
    completedOn: completedOn ?? nowIso().slice(0, 10),
  });
}

/** Cancel a planned or enrolled activity (→ `cancelled`). */
export function cancelActivity(
  activity: ProfessionalLearningActivity,
): ProfessionalLearningActivity {
  if (activity.status !== "planned" && activity.status !== "enrolled") {
    throw new InvalidActivityTransitionError(activity.status, "cancelled");
  }
  return touch(activity, { status: "cancelled" });
}

/** Whether the activity is completed (and therefore earns hours toward the ledger). */
export const isActivityCompleted = (activity: ProfessionalLearningActivity): boolean =>
  activity.status === "completed";
