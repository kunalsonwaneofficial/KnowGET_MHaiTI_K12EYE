import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { InsightDimension, InsightEvent } from "./insight-value";
import {
  EmptyInsightFieldError,
  GrowthGoalNotFoundError,
  GrowthPlanStateError,
  InvalidGrowthPlanError,
} from "./errors";

/** The outcome status of a single growth goal. */
export const GROWTH_GOAL_STATUSES = ["open", "met", "missed"] as const;

export type GrowthGoalStatus = (typeof GROWTH_GOAL_STATUSES)[number];

/** One measurable goal within a growth plan. */
export interface GrowthGoal {
  readonly id: Uuid;
  readonly description: string;
  readonly targetDimension: InsightDimension | null;
  readonly status: GrowthGoalStatus;
  readonly note: string | null;
}

/** The authored content of a goal (its id and status are assigned by the plan). */
export interface GrowthGoalInput {
  readonly description: string;
  readonly targetDimension?: InsightDimension | null;
  readonly note?: string | null;
}

/**
 * Lifecycle of a growth plan. `draft` while goals are set, `active` once being worked, then
 * `achieved` (goals met) or `abandoned`. Achieved and abandoned are terminal.
 */
export const GROWTH_PLAN_STATUSES = ["draft", "active", "achieved", "abandoned"] as const;

export type GrowthPlanStatus = (typeof GROWTH_PLAN_STATUSES)[number];

/**
 * A learner's improvement plan — the loop that turns accepted recommendations into measurable
 * goals with tracked outcomes. It carries the goals, the source recommendations it acts on, and a
 * derived progress percentage (the share of goals met). draft → active → achieved | abandoned;
 * goals are editable only while a draft, and outcomes are recorded while active.
 */
export interface GrowthPlan {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly title: string;
  readonly focusDimension: InsightDimension | null;
  readonly goals: readonly GrowthGoal[];
  readonly sourceRecommendationIds: readonly Uuid[];
  readonly progressPercent: number;
  readonly status: GrowthPlanStatus;
  readonly history: readonly InsightEvent[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateGrowthPlanParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly title: string;
  readonly focusDimension?: InsightDimension | null;
  readonly goals?: readonly GrowthGoalInput[];
  readonly sourceRecommendationIds?: readonly Uuid[];
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyInsightFieldError(field);
  }
  return trimmed;
};

const buildGoal = (input: GrowthGoalInput): GrowthGoal => ({
  id: newUuid(),
  description: requireText(input.description, "goal description"),
  targetDimension: input.targetDimension ?? null,
  status: "open",
  note: input.note?.trim() || null,
});

/** The share of goals met, 0–100 two-decimal (0 when there are no goals). */
const progressOf = (goals: readonly GrowthGoal[]): number => {
  if (goals.length === 0) {
    return 0;
  }
  const met = goals.filter((g) => g.status === "met").length;
  return Math.round((10000 * met) / goals.length) / 100;
};

const touch = (plan: GrowthPlan, patch: Partial<GrowthPlan>): GrowthPlan => ({
  ...plan,
  ...patch,
  updatedAt: nowIso(),
});

const entry = (action: string, actor: Uuid | null, note: string | null): InsightEvent => ({
  action,
  actor,
  at: nowIso(),
  note,
});

/** Create a new draft growth plan. */
export function createGrowthPlan(params: CreateGrowthPlanParams): GrowthPlan {
  const now = nowIso();
  const goals = params.goals ? params.goals.map(buildGoal) : [];
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    studentId: params.studentId,
    title: requireText(params.title, "title"),
    focusDimension: params.focusDimension ?? null,
    goals,
    sourceRecommendationIds: params.sourceRecommendationIds
      ? [...params.sourceRecommendationIds]
      : [],
    progressPercent: progressOf(goals),
    status: "draft",
    history: [{ action: "created", actor: null, at: now, note: null }],
    createdAt: now,
    updatedAt: now,
  };
}

/** Replace the goals. Only while a draft. */
export function setGrowthGoals(plan: GrowthPlan, goals: readonly GrowthGoalInput[]): GrowthPlan {
  if (plan.status !== "draft") {
    throw new GrowthPlanStateError(plan.id, "draft", plan.status);
  }
  const built = goals.map(buildGoal);
  return touch(plan, { goals: built, progressPercent: progressOf(built) });
}

/** Link an additional source recommendation this plan acts on. Not permitted once terminal. */
export function linkRecommendation(plan: GrowthPlan, recommendationId: Uuid): GrowthPlan {
  if (plan.status === "achieved" || plan.status === "abandoned") {
    throw new GrowthPlanStateError(plan.id, "draft or active", plan.status);
  }
  if (plan.sourceRecommendationIds.includes(recommendationId)) {
    return plan;
  }
  return touch(plan, {
    sourceRecommendationIds: [...plan.sourceRecommendationIds, recommendationId],
  });
}

/** Activate the plan so goals can be worked and outcomes recorded (draft → active). */
export function activateGrowthPlan(plan: GrowthPlan, actor: Uuid | null = null): GrowthPlan {
  if (plan.status !== "draft") {
    throw new GrowthPlanStateError(plan.id, "draft", plan.status);
  }
  if (plan.goals.length === 0) {
    throw new InvalidGrowthPlanError("a plan needs at least one goal before it can be activated");
  }
  return touch(plan, {
    status: "active",
    history: [...plan.history, entry("activated", actor, null)],
  });
}

/** Record a goal's outcome (met or missed) and recompute progress. Only while active. */
export function recordGoalOutcome(
  plan: GrowthPlan,
  goalId: Uuid,
  outcome: "met" | "missed",
  note: string | null = null,
): GrowthPlan {
  if (plan.status !== "active") {
    throw new GrowthPlanStateError(plan.id, "active", plan.status);
  }
  if (!plan.goals.some((g) => g.id === goalId)) {
    throw new GrowthGoalNotFoundError(plan.id, goalId);
  }
  const goals = plan.goals.map((g) =>
    g.id === goalId ? { ...g, status: outcome, note: note?.trim() || g.note } : g,
  );
  return touch(plan, { goals, progressPercent: progressOf(goals) });
}

/** Mark the plan achieved (active → achieved). Terminal. */
export function achieveGrowthPlan(plan: GrowthPlan, actor: Uuid | null = null): GrowthPlan {
  if (plan.status !== "active") {
    throw new GrowthPlanStateError(plan.id, "active", plan.status);
  }
  return touch(plan, {
    status: "achieved",
    history: [...plan.history, entry("achieved", actor, null)],
  });
}

/** Abandon the plan (draft or active → abandoned). Terminal. */
export function abandonGrowthPlan(
  plan: GrowthPlan,
  actor: Uuid | null = null,
  note: string | null = null,
): GrowthPlan {
  if (plan.status === "achieved" || plan.status === "abandoned") {
    throw new GrowthPlanStateError(plan.id, "draft or active", plan.status);
  }
  return touch(plan, {
    status: "abandoned",
    history: [...plan.history, entry("abandoned", actor, note?.trim() || null)],
  });
}
