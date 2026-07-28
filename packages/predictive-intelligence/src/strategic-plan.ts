import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { MetricDirection, PlanStatus } from "./forecast-value";
import {
  isFiniteValue,
  normalizeMetricKey,
  normalizeObjectiveKey,
  normalizePlanKey,
  roundValue,
} from "./forecast-value";
import type { ObjectiveProgressView, ObjectiveView, PlanVariance } from "./forecast-view";
import {
  ActivePlanObjectivesFrozenError,
  AnonymousPlanReviewError,
  DuplicateObjectiveKeyError,
  DuplicatePlanKeyError,
  EmptyObjectiveKeyError,
  EmptyObjectiveMetricKeyError,
  EmptyPlanKeyError,
  EmptyPlanNameError,
  InvalidPlanPeriodError,
  InvalidPlanTransitionError,
  NonFiniteObjectiveValueError,
  ObjectiveNotFoundError,
  ObjectiveTargetPeriodError,
  PlanNotActiveError,
  PlanWithoutObjectivesError,
} from "./errors";
import { computePlanVariance, latestProgressAt } from "./planning";

/**
 * What the institution committed to, in a form it can be held to.
 *
 * A strategic plan normally lives as a document, and documents fail in a characteristic way: the objectives are
 * declared, the review meetings happen, each objective is discussed on its own terms, and the question "are we
 * actually going to arrive" is never asked with a number attached. This aggregate is that document turned into a
 * measurement. The engine in {@link computePlanVariance} does the arithmetic; what lives here is everything that
 * has to be true about the record for the arithmetic to mean anything a year later.
 *
 * **The objectives freeze when the plan goes active, and that is the central rule.** A draft is a proposal and
 * may be reshaped freely. An active plan is a commitment, and an institution that can lower a target midway
 * through the year has not made one — worse, it has invalidated every review already taken, because each of those
 * reviews reported a trajectory towards a target that no longer exists. `version` identifies the objective set
 * and therefore stops moving at activation, so a review that pinned version 3 is a statement about a specific set
 * of commitments rather than about whatever the plan was later edited to say. Changing the commitments means a
 * new plan under a new key, which is the honest expression of what happened.
 *
 * **Progress is append-only and is never sorted.** {@link latestProgressAt} resolves two readings at one period
 * by taking the later one in the list, which is the only tiebreak available in a domain with no clock and is the
 * conventional reading of a correction appended after the fact. Sorting the readings — by period, by key, by
 * anything — would silently decide which of two corrections wins, and would decide it differently depending on
 * the sort's stability. So the arrival order is the record, and this aggregate preserves it exactly.
 *
 * **A review freezes the whole variance it computed, not a reference to it.** The counts, every objective's state
 * and the plan's overall state are copied onto the review beside the plan version they were computed from. A
 * review is what goes into a board paper, and a board paper's numbers have to still be its numbers after three
 * more months of readings have landed. Recomputing on read would quietly rewrite history that people acted on.
 *
 * **Every act that commits or closes the institution names a person.** Activation, review, completion and
 * abandonment all refuse to proceed anonymously, because each is the institution making a statement about its own
 * performance, and a statement of that kind with nobody behind it is the one governance most needs to prevent.
 *
 * There is no clock in the plan's grid. `startPeriod`, an objective's `targetPeriod` and a reading's `period` are
 * integer indices into whatever grid the plan declared, so a review recomputed years later lands on the periods
 * it landed on the first time.
 */

// --- The aggregate ---------------------------------------------------------------

export interface StrategicPlan {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** Unique within the organization. There is no versioned family of plans under one key. */
  readonly planKey: string;
  readonly name: string;
  readonly description: string | null;
  /** Where the trajectory starts. Every objective's straight line is drawn from here. */
  readonly startPeriod: number;
  /** Held sorted by key, so one objective set always presents identically however it was assembled. */
  readonly objectives: readonly ObjectiveView[];
  /** Held in arrival order and never sorted — see {@link latestProgressAt} for why that is load-bearing. */
  readonly progress: readonly ObjectiveProgressView[];
  /** Held in the order they were taken. Each carries the variance it computed, frozen. */
  readonly reviews: readonly PlanReview[];
  /** The identity of the objective set. Advances while the plan is a draft; frozen at activation. */
  readonly version: number;
  readonly status: PlanStatus;
  readonly activatedByUserId: Uuid | null;
  readonly activatedAt: ISODateString | null;
  /** Who closed the plan, whether by completing it or abandoning it. */
  readonly closedByUserId: Uuid | null;
  readonly closedAt: ISODateString | null;
  /** Why the plan was abandoned, where a reason was given. Always null on a completed plan. */
  readonly abandonmentReason: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

/**
 * A review taken at a period, with the plan's position at that moment kept whole.
 *
 * `planVersion` is what makes the frozen variance interpretable: it says which set of objectives these counts
 * were counts of. Without it a review from a plan that was still a draft at the time would be indistinguishable
 * from one taken against the committed set.
 */
export interface PlanReview {
  readonly period: number;
  /** The objective-set version the variance was computed against. */
  readonly planVersion: number;
  /** Computed once, at review time, and never recomputed. What the institution actually saw. */
  readonly variance: PlanVariance;
  readonly note: string | null;
  readonly reviewedByUserId: Uuid;
  readonly reviewedAt: ISODateString;
}

export interface StrategicPlanParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly planKey: string;
  readonly name: string;
  readonly description?: string | null;
  /** The first period of the plan. A whole index on the grid the plan is measured against. */
  readonly startPeriod: number;
  /** Optional here. A plan is only required to have objectives by the time it is activated. */
  readonly objectives?: readonly ObjectiveInput[];
}

/** What may be restated on a plan that is not yet closed. The objectives have their own operations. */
export interface PlanAmendment {
  readonly name?: string;
  readonly description?: string | null;
}

/** An objective as a caller supplies it, before the plan has judged it. */
export interface ObjectiveInput {
  readonly objectiveKey: string;
  /** What is being tracked. An opaque reference to a metric the institution already publishes. */
  readonly metricKey: string;
  readonly direction: MetricDirection;
  /** Where the metric stood when the objective was set. The origin of the trajectory. */
  readonly baselineValue: number;
  readonly targetValue: number;
  /** When the target is due. Must fall after the plan starts, or there is no journey to measure. */
  readonly targetPeriod: number;
}

/** What may be restated on an objective that is already part of a draft plan. */
export interface ObjectiveAmendment {
  readonly metricKey?: string;
  readonly direction?: MetricDirection;
  readonly baselineValue?: number;
  readonly targetValue?: number;
  readonly targetPeriod?: number;
}

/** A reading against one objective at one period, as a caller supplies it. */
export interface ProgressInput {
  readonly objectiveKey: string;
  readonly period: number;
  readonly actualValue: number;
}

export interface PlanReviewParams {
  readonly period: number;
  /** Required in practice. Typed nullable so an unauthenticated caller is refused rather than uncallable. */
  readonly reviewedByUserId: Uuid | null;
  readonly note?: string | null;
}

// --- Declaration -----------------------------------------------------------------

/**
 * Draft a plan. It starts editable at version 1, with no readings and no reviews.
 *
 * Objectives may be supplied here or added afterwards; the two paths validate identically, because a plan
 * declared whole and one assembled objective by objective are the same plan and must be refused for the same
 * reasons.
 */
export function draftStrategicPlan(params: StrategicPlanParams): StrategicPlan {
  const planKey = normalizePlanKey(params.planKey);
  if (planKey.length === 0) throw new EmptyPlanKeyError();

  const name = params.name.trim();
  if (name.length === 0) throw new EmptyPlanNameError();

  if (!Number.isInteger(params.startPeriod)) {
    throw new InvalidPlanPeriodError("startPeriod", params.startPeriod);
  }

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    planKey,
    name,
    description: params.description?.trim() ?? null,
    startPeriod: params.startPeriod,
    objectives: orderObjectives(acceptObjectives([], params.objectives ?? [], params.startPeriod)),
    progress: [],
    reviews: [],
    version: 1,
    status: "draft",
    activatedByUserId: null,
    activatedAt: null,
    closedByUserId: null,
    closedAt: null,
    abandonmentReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Restate a plan's name or description.
 *
 * Permitted while the plan is active, because neither reaches the trajectory arithmetic and a plan given a
 * clearer name mid-year is the same commitment better labelled. Neither advances the version, for the reason
 * {@link amendScenario} does not advance a scenario's: a version that moves on things no arithmetic reads is a
 * version people learn to ignore. A closed plan is refused outright — it is a record of what happened, and
 * records are not edited.
 */
export function amendPlan(plan: StrategicPlan, amendment: PlanAmendment): StrategicPlan {
  if (plan.status !== "draft" && plan.status !== "active") {
    throw new InvalidPlanTransitionError(plan.status, "amended");
  }

  const name = amendment.name === undefined ? plan.name : amendment.name.trim();
  if (name.length === 0) throw new EmptyPlanNameError();

  return touch(plan, {
    name,
    description:
      amendment.description === undefined
        ? plan.description
        : (amendment.description?.trim() ?? null),
  });
}

// --- Objectives ------------------------------------------------------------------

/** Add one objective. Refuses a key the plan already carries. */
export const addObjective = (plan: StrategicPlan, objective: ObjectiveInput): StrategicPlan =>
  addObjectives(plan, [objective]);

/**
 * Add several objectives as a single act.
 *
 * Validated whole and applied whole, so a batch containing one impossible objective leaves the plan untouched and
 * a good batch advances the version once. Duplicates are refused within the batch as well as against the plan: a
 * batch that quietly kept the last of two objectives named `attendance.rate` would resolve an ambiguity the
 * caller did not know they had created, and every reading recorded afterwards would attach to whichever of the
 * two survived.
 */
export function addObjectives(
  plan: StrategicPlan,
  objectives: readonly ObjectiveInput[],
): StrategicPlan {
  guardObjectivesMutable(plan);
  if (objectives.length === 0) return plan;
  return bump(plan, {
    objectives: acceptObjectives(plan.objectives, objectives, plan.startPeriod),
  });
}

/**
 * Restate an objective that is already there.
 *
 * The key is the objective's identity and is not amendable — an objective renamed in place is a different
 * objective wearing an existing one's history, and the honest expression of that is a removal and an addition.
 * A restatement that changes nothing returns the plan untouched rather than advancing the version, so a caller
 * resubmitting a form does not make the plan look as though it moved.
 */
export function amendObjective(
  plan: StrategicPlan,
  objectiveKey: string,
  amendment: ObjectiveAmendment,
): StrategicPlan {
  guardObjectivesMutable(plan);

  const key = normalizeObjectiveKey(objectiveKey);
  const existing = objectiveAt(plan, key);
  if (existing === null) throw new ObjectiveNotFoundError(plan.id, key);

  const amended = normalizeObjective(
    {
      objectiveKey: key,
      metricKey: amendment.metricKey ?? existing.metricKey,
      direction: amendment.direction ?? existing.direction,
      baselineValue: amendment.baselineValue ?? existing.baselineValue,
      targetValue: amendment.targetValue ?? existing.targetValue,
      targetPeriod: amendment.targetPeriod ?? existing.targetPeriod,
    },
    plan.startPeriod,
  );
  if (sameObjective(amended, existing)) return plan;

  return bump(plan, {
    objectives: plan.objectives.map((objective) =>
      objective.objectiveKey === key ? amended : objective,
    ),
  });
}

/**
 * Remove an objective. Refuses a key the plan does not carry rather than succeeding vacuously.
 *
 * No reading can be orphaned by this, because readings are only accepted against an active plan and objectives
 * are only removable from a draft. The two rules meet exactly, which is why neither needs to know about the
 * other.
 */
export function removeObjective(plan: StrategicPlan, objectiveKey: string): StrategicPlan {
  guardObjectivesMutable(plan);

  const key = normalizeObjectiveKey(objectiveKey);
  if (objectiveAt(plan, key) === null) throw new ObjectiveNotFoundError(plan.id, key);

  return bump(plan, {
    objectives: plan.objectives.filter((objective) => objective.objectiveKey !== key),
  });
}

// --- Lifecycle -------------------------------------------------------------------

/**
 * Activate the plan, freezing its objectives and starting the measurement.
 *
 * A plan with no objectives is refused. It would review as `on_track` forever — {@link computePlanVariance}
 * reports an empty plan healthy, correctly, because an aggregate is the wrong place to object to an empty plan.
 * This is the right place, and it is the last moment at which the objection is cheap.
 *
 * The checks run status, then substance, then accountability. That ordering puts the most informative refusal
 * first: a draft that names nobody *and* commits to nothing has a substantive problem, and reporting the missing
 * signature would send the caller to fix the wrong thing.
 */
export function activatePlan(plan: StrategicPlan, activatedByUserId: Uuid | null): StrategicPlan {
  if (plan.status !== "draft") throw new InvalidPlanTransitionError(plan.status, "active");
  if (plan.objectives.length === 0) throw new PlanWithoutObjectivesError(plan.id);
  if (activatedByUserId === null) throw new AnonymousPlanReviewError("activated");

  return touch(plan, { status: "active", activatedByUserId, activatedAt: nowIso() });
}

/**
 * Close an active plan as delivered.
 *
 * Completion is a claim about the institution's own performance, so it names the person making it. Nothing is
 * checked about whether the objectives were actually met: a plan may be closed with objectives missed, and the
 * reviews say so. A completion that refused to happen until every target was hit would simply leave failed plans
 * open forever, which is how an institution loses the record of having failed.
 */
export function completePlan(plan: StrategicPlan, completedByUserId: Uuid | null): StrategicPlan {
  if (plan.status !== "active") throw new InvalidPlanTransitionError(plan.status, "completed");
  if (completedByUserId === null) throw new AnonymousPlanReviewError("completed");

  return touch(plan, {
    status: "completed",
    closedByUserId: completedByUserId,
    closedAt: nowIso(),
  });
}

/**
 * Close a plan the institution is no longer pursuing.
 *
 * Available from `draft` as well as `active`, because a proposal that was never adopted is as real an outcome as
 * one that was abandoned midway, and deleting the draft would leave no trace that the institution considered it.
 * The reason is a required argument but may be `null`: there is no error in this vocabulary for an unexplained
 * abandonment, and inventing one here would put a rule in the domain that governance never asked for. Requiring
 * the argument at least makes leaving it out a decision somebody took at the call site.
 */
export function abandonPlan(
  plan: StrategicPlan,
  abandonedByUserId: Uuid | null,
  reason: string | null,
): StrategicPlan {
  if (plan.status !== "draft" && plan.status !== "active") {
    throw new InvalidPlanTransitionError(plan.status, "abandoned");
  }
  if (abandonedByUserId === null) throw new AnonymousPlanReviewError("abandoned");

  const trimmed = reason?.trim() ?? "";
  return touch(plan, {
    status: "abandoned",
    closedByUserId: abandonedByUserId,
    closedAt: nowIso(),
    abandonmentReason: trimmed.length === 0 ? null : trimmed,
  });
}

// --- Progress and review ---------------------------------------------------------

/**
 * Record readings against the plan's objectives.
 *
 * Appended, never merged. A second reading at a period the plan has already heard from is a correction, and
 * {@link latestProgressAt} reads the later of the two — so the history of what was believed at each point
 * survives, rather than being overwritten by whatever arrived last. That is the difference between a plan whose
 * numbers changed and a plan that can explain when they changed.
 *
 * Only an active plan accepts readings. A draft has made no commitment to measure against, and a closed plan's
 * variance is settled; a late reading against either would be a number attached to a trajectory nobody was
 * travelling.
 */
export function recordProgress(
  plan: StrategicPlan,
  readings: readonly ProgressInput[],
): StrategicPlan {
  requireActivePlan(plan);
  if (readings.length === 0) return plan;
  return touch(plan, { progress: [...plan.progress, ...acceptReadings(plan, readings)] });
}

/**
 * Take a review at a period, freezing where the plan stood.
 *
 * The variance is computed here and kept. Reviews are what leadership acts on and what an auditor returns to, and
 * a review that recomputed itself on every read would show a different plan to the person who asked in March than
 * to the person who asked in September, both of them looking at the same review.
 *
 * The period is not required to be at or after the plan's start, nor to follow the previous review. Both would be
 * plausible rules and both would be this package inventing governance: {@link elapsedFraction} already clamps a
 * period before the start to zero elapsed, and a review deliberately taken at an earlier period — to reconstruct
 * what a past meeting would have seen — is a legitimate thing to want.
 */
export function reviewPlan(plan: StrategicPlan, params: PlanReviewParams): StrategicPlan {
  requireActivePlan(plan);

  if (!Number.isInteger(params.period)) throw new InvalidPlanPeriodError("period", params.period);

  const reviewedByUserId = params.reviewedByUserId;
  if (reviewedByUserId === null) throw new AnonymousPlanReviewError("reviewed");

  const review: PlanReview = {
    period: params.period,
    planVersion: plan.version,
    variance: planVarianceAt(plan, params.period),
    note: params.note?.trim() ?? null,
    reviewedByUserId,
    reviewedAt: nowIso(),
  };
  return touch(plan, { reviews: [...plan.reviews, review] });
}

// --- Guards ----------------------------------------------------------------------

/** Refuse a plan key already taken in this organization. What a drafting service calls first. */
export function guardPlanKeyAvailable(planKey: string, takenKeys: readonly string[]): void {
  const key = normalizePlanKey(planKey);
  if (takenKeys.some((taken) => normalizePlanKey(taken) === key)) {
    throw new DuplicatePlanKeyError(key);
  }
}

/** Refuse anything but a plan the institution is currently operating under. */
export function requireActivePlan(plan: StrategicPlan): StrategicPlan {
  if (plan.status !== "active") throw new PlanNotActiveError(plan.id, plan.status);
  return plan;
}

function guardObjectivesMutable(plan: StrategicPlan): void {
  if (plan.status !== "draft") throw new ActivePlanObjectivesFrozenError(plan.id, plan.status);
}

// --- Internals -------------------------------------------------------------------

/**
 * A caller's objective as the plan will hold it: keys normalized, values rounded, trajectory checked.
 *
 * Finiteness is checked before rounding because {@link roundValue} passes a non-finite value straight through,
 * so checking afterwards would gain nothing and lose the field name. Unlike a lever's magnitude there is no
 * rounds-away-to-nothing hazard to guard against: zero is a perfectly ordinary baseline, and an objective whose
 * target rounds to its baseline is simply one asking the institution to hold a level, which
 * {@link trackingStateFor} already handles as its own case.
 */
const normalizeObjective = (input: ObjectiveInput, startPeriod: number): ObjectiveView => {
  const objectiveKey = normalizeObjectiveKey(input.objectiveKey);
  if (objectiveKey.length === 0) throw new EmptyObjectiveKeyError();

  const metricKey = normalizeMetricKey(input.metricKey);
  if (metricKey.length === 0) throw new EmptyObjectiveMetricKeyError();

  if (!isFiniteValue(input.baselineValue)) {
    throw new NonFiniteObjectiveValueError(objectiveKey, "baselineValue");
  }
  if (!isFiniteValue(input.targetValue)) {
    throw new NonFiniteObjectiveValueError(objectiveKey, "targetValue");
  }
  if (!isFiniteValue(input.targetPeriod)) {
    throw new NonFiniteObjectiveValueError(objectiveKey, "targetPeriod");
  }
  if (!Number.isInteger(input.targetPeriod)) {
    throw new InvalidPlanPeriodError("targetPeriod", input.targetPeriod);
  }
  if (input.targetPeriod <= startPeriod) {
    throw new ObjectiveTargetPeriodError(objectiveKey, input.targetPeriod, startPeriod);
  }

  return {
    objectiveKey,
    metricKey,
    direction: input.direction,
    baselineValue: roundValue(input.baselineValue),
    targetValue: roundValue(input.targetValue),
    targetPeriod: input.targetPeriod,
  };
};

/**
 * The objective set that results from adding these inputs to those, or nothing at all if any input is refused.
 *
 * Shared by declaration and addition so the two paths cannot drift. A plan declared with three objectives and one
 * assembled from three additions must be refused by the same rules, or the way to get an invalid plan past this
 * aggregate would be to choose the other constructor.
 */
const acceptObjectives = (
  existing: readonly ObjectiveView[],
  incoming: readonly ObjectiveInput[],
  startPeriod: number,
): readonly ObjectiveView[] => {
  const keys = new Set(existing.map((objective) => objective.objectiveKey));
  const accepted: ObjectiveView[] = [];

  for (const input of incoming) {
    const objective = normalizeObjective(input, startPeriod);
    if (keys.has(objective.objectiveKey)) {
      throw new DuplicateObjectiveKeyError(objective.objectiveKey);
    }
    keys.add(objective.objectiveKey);
    accepted.push(objective);
  }

  return [...existing, ...accepted];
};

/**
 * The readings that result from these inputs, or nothing at all if any is refused.
 *
 * Every reading names an objective the plan actually carries. A reading against an unknown key would sit in the
 * record contributing to nothing and would never be seen again, which is worse than a refusal: the caller would
 * believe the number had been recorded, and in a sense it would have been.
 */
const acceptReadings = (
  plan: StrategicPlan,
  readings: readonly ProgressInput[],
): readonly ObjectiveProgressView[] =>
  readings.map((reading) => {
    const objectiveKey = normalizeObjectiveKey(reading.objectiveKey);
    if (objectiveAt(plan, objectiveKey) === null) {
      throw new ObjectiveNotFoundError(plan.id, objectiveKey);
    }
    if (!Number.isInteger(reading.period)) {
      throw new InvalidPlanPeriodError("period", reading.period);
    }
    if (!isFiniteValue(reading.actualValue)) {
      throw new NonFiniteObjectiveValueError(objectiveKey, "actualValue");
    }
    return { objectiveKey, period: reading.period, actualValue: roundValue(reading.actualValue) };
  });

/** Whether two objectives say the same thing. Keys are compared by the caller, which already matched on them. */
const sameObjective = (a: ObjectiveView, b: ObjectiveView): boolean =>
  a.metricKey === b.metricKey &&
  a.direction === b.direction &&
  a.baselineValue === b.baselineValue &&
  a.targetValue === b.targetValue &&
  a.targetPeriod === b.targetPeriod;

/** By key, matching the order {@link computePlanVariance} returns its objectives in. */
const orderObjectives = (objectives: readonly ObjectiveView[]): readonly ObjectiveView[] =>
  [...objectives].sort((a, b) =>
    a.objectiveKey === b.objectiveKey ? 0 : a.objectiveKey < b.objectiveKey ? -1 : 1,
  );

const touch = (plan: StrategicPlan, patch: Partial<StrategicPlan>): StrategicPlan => ({
  ...plan,
  ...patch,
  updatedAt: nowIso(),
});

/**
 * Apply a change to what the plan commits to, advancing the version and restoring key order.
 *
 * Ordering on every change rather than at review time is what makes the version meaningful: two plans holding the
 * same objectives must present them identically, or one version number would describe two different commitments
 * depending on the order somebody added them in.
 */
const bump = (plan: StrategicPlan, patch: Partial<StrategicPlan>): StrategicPlan => {
  const next = touch(plan, { ...patch, version: plan.version + 1 });
  return { ...next, objectives: orderObjectives(next.objectives) };
};

// --- Reading ---------------------------------------------------------------------

/** The objective under a key, or `null` where the plan does not carry one. */
export const objectiveAt = (plan: StrategicPlan, objectiveKey: string): ObjectiveView | null => {
  const key = normalizeObjectiveKey(objectiveKey);
  return plan.objectives.find((objective) => objective.objectiveKey === key) ?? null;
};

/** How many objectives the plan commits to. */
export const objectiveCount = (plan: StrategicPlan): number => plan.objectives.length;

/**
 * Where the plan stands at a period, computed now from everything recorded so far.
 *
 * This is the live view and it moves as readings arrive, which is exactly what a dashboard wants and exactly what
 * a board paper must not have. {@link reviewPlan} is the other one: the same computation, kept.
 */
export const planVarianceAt = (plan: StrategicPlan, period: number): PlanVariance =>
  computePlanVariance(plan.planKey, plan.objectives, plan.progress, period, plan.startPeriod);

/** The most recent review, or `null` where the plan has never been reviewed. */
export const latestReview = (plan: StrategicPlan): PlanReview | null =>
  plan.reviews[plan.reviews.length - 1] ?? null;

/** Whether the institution is currently operating under this plan. */
export const isPlanOperating = (plan: StrategicPlan): boolean => plan.status === "active";

/**
 * The objectives with no reading at or before a period.
 *
 * {@link computeObjectiveVariance} scores an unmeasured objective at its baseline rather than dropping it, which
 * is the right aggregate but reads identically to an objective that genuinely has not moved. This is what tells
 * the two apart, and a plan review that does not ask for it is one where a third of the objectives can go
 * unmeasured while the plan reports itself healthy.
 */
export const unmeasuredObjectiveKeys = (plan: StrategicPlan, period: number): readonly string[] =>
  plan.objectives
    .filter((objective) => latestProgressAt(plan.progress, objective.objectiveKey, period) === null)
    .map((objective) => objective.objectiveKey);

/** How anything downstream refers to this plan: the key and the objective-set version it committed to. */
export const planReference = (plan: StrategicPlan): { planKey: string; planVersion: number } => ({
  planKey: plan.planKey,
  planVersion: plan.version,
});
