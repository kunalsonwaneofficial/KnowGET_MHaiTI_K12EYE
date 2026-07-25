import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyGoalDescriptionError, InvalidGoalTransitionError } from "./errors";
import type { GoalStatus } from "./faculty-value";

/**
 * A development goal — a professional-growth objective for a staff member, optionally targeting a
 * competency of a {@link CompetencyFramework} and/or arising from a {@link CoachingEngagement}. It
 * runs `draft → active → achieved | abandoned`; the terminal transition records a reasoned outcome.
 * A goal's progress feeds the descriptive faculty-growth profile.
 */
export interface DevelopmentGoal {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly description: string;
  readonly targetCompetencyKey: string | null;
  readonly frameworkId: Uuid | null;
  readonly engagementId: Uuid | null;
  readonly targetDate: string | null;
  readonly status: GoalStatus;
  readonly outcome: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface DraftGoalParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly description: string;
  readonly targetCompetencyKey?: string | null;
  readonly frameworkId?: Uuid | null;
  readonly engagementId?: Uuid | null;
  readonly targetDate?: string | null;
}

/** Draft a development goal (status `draft`). Description required. */
export function draftGoal(params: DraftGoalParams): DevelopmentGoal {
  const description = params.description.trim();
  if (description.length === 0) {
    throw new EmptyGoalDescriptionError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    employeeId: params.employeeId,
    description,
    targetCompetencyKey: params.targetCompetencyKey?.trim() || null,
    frameworkId: params.frameworkId ?? null,
    engagementId: params.engagementId ?? null,
    targetDate: params.targetDate ?? null,
    status: "draft",
    outcome: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (goal: DevelopmentGoal, patch: Partial<DevelopmentGoal>): DevelopmentGoal => ({
  ...goal,
  ...patch,
  updatedAt: nowIso(),
});

/** Set (or clear) the goal's description (while not terminal). */
export function setGoalDescription(goal: DevelopmentGoal, description: string): DevelopmentGoal {
  if (goal.status === "achieved" || goal.status === "abandoned") {
    throw new InvalidGoalTransitionError(goal.status, "set_description");
  }
  const trimmed = description.trim();
  if (trimmed.length === 0) {
    throw new EmptyGoalDescriptionError();
  }
  return touch(goal, { description: trimmed });
}

/** Set (or clear) the goal's target date (while not terminal). */
export function setGoalTargetDate(
  goal: DevelopmentGoal,
  targetDate: string | null,
): DevelopmentGoal {
  if (goal.status === "achieved" || goal.status === "abandoned") {
    throw new InvalidGoalTransitionError(goal.status, "set_target_date");
  }
  return touch(goal, { targetDate });
}

/** Activate a drafted goal (→ `active`). */
export function activateGoal(goal: DevelopmentGoal): DevelopmentGoal {
  if (goal.status !== "draft") {
    throw new InvalidGoalTransitionError(goal.status, "active");
  }
  return touch(goal, { status: "active" });
}

/** Mark an active goal achieved, recording a reasoned outcome (→ `achieved`). */
export function achieveGoal(goal: DevelopmentGoal, outcome?: string | null): DevelopmentGoal {
  if (goal.status !== "active") {
    throw new InvalidGoalTransitionError(goal.status, "achieved");
  }
  return touch(goal, { status: "achieved", outcome: outcome?.trim() || null });
}

/** Abandon a drafted or active goal, recording a reasoned outcome (→ `abandoned`). */
export function abandonGoal(goal: DevelopmentGoal, outcome?: string | null): DevelopmentGoal {
  if (goal.status !== "draft" && goal.status !== "active") {
    throw new InvalidGoalTransitionError(goal.status, "abandoned");
  }
  return touch(goal, { status: "abandoned", outcome: outcome?.trim() || null });
}

/** Whether the goal has been achieved. */
export const isGoalAchieved = (goal: DevelopmentGoal): boolean => goal.status === "achieved";
