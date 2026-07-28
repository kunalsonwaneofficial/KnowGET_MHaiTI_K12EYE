import { describe, expect, it } from "vitest";

import type { TenantId, Uuid } from "@knowget/types";
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
import type { ObjectiveInput, StrategicPlan, StrategicPlanParams } from "./strategic-plan";
import {
  abandonPlan,
  activatePlan,
  addObjective,
  addObjectives,
  amendObjective,
  amendPlan,
  completePlan,
  draftStrategicPlan,
  guardPlanKeyAvailable,
  isPlanOperating,
  latestReview,
  objectiveAt,
  objectiveCount,
  planReference,
  planVarianceAt,
  recordProgress,
  removeObjective,
  requireActivePlan,
  reviewPlan,
  unmeasuredObjectiveKeys,
} from "./strategic-plan";

const TENANT = "11111111-1111-4111-8111-111111111111" as TenantId;
const ORGANIZATION = "22222222-2222-4222-8222-222222222222" as Uuid;
const LEADER = "44444444-4444-4444-8444-444444444444" as Uuid;

/** Climbing to a target: attendance from 90 to 96 by period 12, on a plan that starts at 0. */
const ATTENDANCE: ObjectiveInput = {
  objectiveKey: "attendance.rate",
  metricKey: "attendance.rate",
  direction: "higher_is_better",
  baselineValue: 90,
  targetValue: 96,
  targetPeriod: 12,
};

/** Falling to a target, so that direction handling is exercised rather than assumed. */
const ABSENCE: ObjectiveInput = {
  objectiveKey: "chronic.absence",
  metricKey: "absence.chronic",
  direction: "lower_is_better",
  baselineValue: 20,
  targetValue: 10,
  targetPeriod: 12,
};

const objective = (overrides: Partial<ObjectiveInput> = {}): ObjectiveInput => ({
  ...ATTENDANCE,
  ...overrides,
});

const draft = (overrides: Partial<StrategicPlanParams> = {}): StrategicPlan =>
  draftStrategicPlan({
    tenantId: TENANT,
    organizationId: ORGANIZATION,
    planKey: "growth.2027",
    name: "Growth 2027",
    startPeriod: 0,
    objectives: [ATTENDANCE, ABSENCE],
    ...overrides,
  });

const active = (overrides: Partial<StrategicPlanParams> = {}): StrategicPlan =>
  activatePlan(draft(overrides), LEADER);

/** Both objectives exactly on their straight line at the halfway period. */
const onLine = (plan: StrategicPlan): StrategicPlan =>
  recordProgress(plan, [
    { objectiveKey: "attendance.rate", period: 6, actualValue: 93 },
    { objectiveKey: "chronic.absence", period: 6, actualValue: 15 },
  ]);

const stateOf = (plan: StrategicPlan, period: number, objectiveKey: string): string | undefined =>
  planVarianceAt(plan, period).objectives.find((v) => v.objectiveKey === objectiveKey)?.state;

describe("draftStrategicPlan", () => {
  it("starts editable at version 1 with nothing recorded against it", () => {
    const plan = draft();

    expect(plan.status).toBe("draft");
    expect(plan.version).toBe(1);
    expect(plan.progress).toEqual([]);
    expect(plan.reviews).toEqual([]);
    expect(plan.activatedByUserId).toBeNull();
    expect(plan.activatedAt).toBeNull();
    expect(plan.closedByUserId).toBeNull();
    expect(plan.closedAt).toBeNull();
    expect(plan.abandonmentReason).toBeNull();
    expect(plan.createdAt).toBe(plan.updatedAt);
  });

  it("normalizes the plan key and trims the name", () => {
    const plan = draft({ planKey: "  Growth.2027  ", name: "  Growth 2027  " });

    expect(plan.planKey).toBe("growth.2027");
    expect(plan.name).toBe("Growth 2027");
  });

  it("trims a description and keeps null where none was given", () => {
    expect(draft({ description: "  Three-year lift  " }).description).toBe("Three-year lift");
    expect(draft().description).toBeNull();
  });

  it("refuses a blank plan key", () => {
    expect(() => draft({ planKey: "   " })).toThrow(EmptyPlanKeyError);
  });

  it("refuses a blank name", () => {
    expect(() => draft({ name: "   " })).toThrow(EmptyPlanNameError);
  });

  it("refuses a start period that is not a whole index", () => {
    expect(() => draft({ startPeriod: 1.5 })).toThrow(InvalidPlanPeriodError);
    expect(() => draft({ startPeriod: Number.NaN })).toThrow(InvalidPlanPeriodError);
  });

  it("holds declared objectives sorted by key", () => {
    const plan = draft({ objectives: [ABSENCE, ATTENDANCE] });

    expect(plan.objectives.map((o) => o.objectiveKey)).toEqual([
      "attendance.rate",
      "chronic.absence",
    ]);
  });

  it("normalizes objective and metric keys and rounds the values", () => {
    const plan = draft({
      objectives: [
        objective({
          objectiveKey: " Attendance.Rate ",
          metricKey: " Attendance.Rate ",
          baselineValue: 90.12345678,
          targetValue: 96.98765432,
        }),
      ],
    });
    const stored = objectiveAt(plan, "attendance.rate");

    expect(stored?.objectiveKey).toBe("attendance.rate");
    expect(stored?.metricKey).toBe("attendance.rate");
    expect(stored?.baselineValue).toBe(90.123457);
    expect(stored?.targetValue).toBe(96.987654);
  });

  it("refuses an objective with a blank key", () => {
    expect(() => draft({ objectives: [objective({ objectiveKey: "   " })] })).toThrow(
      EmptyObjectiveKeyError,
    );
  });

  it("refuses an objective that names no metric", () => {
    expect(() => draft({ objectives: [objective({ metricKey: "   " })] })).toThrow(
      EmptyObjectiveMetricKeyError,
    );
  });

  it("refuses a non-finite baseline, target or target period", () => {
    expect(() => draft({ objectives: [objective({ baselineValue: Number.NaN })] })).toThrow(
      NonFiniteObjectiveValueError,
    );
    expect(() =>
      draft({ objectives: [objective({ targetValue: Number.POSITIVE_INFINITY })] }),
    ).toThrow(NonFiniteObjectiveValueError);
    expect(() => draft({ objectives: [objective({ targetPeriod: Number.NaN })] })).toThrow(
      NonFiniteObjectiveValueError,
    );
  });

  it("refuses a target period that is not a whole index", () => {
    expect(() => draft({ objectives: [objective({ targetPeriod: 12.5 })] })).toThrow(
      InvalidPlanPeriodError,
    );
  });

  it("refuses a target period at or before the plan's start", () => {
    expect(() => draft({ startPeriod: 12, objectives: [objective({ targetPeriod: 12 })] })).toThrow(
      ObjectiveTargetPeriodError,
    );
    expect(() => draft({ startPeriod: 12, objectives: [objective({ targetPeriod: 11 })] })).toThrow(
      ObjectiveTargetPeriodError,
    );
  });

  it("refuses a duplicate key identically whether declared whole or added later", () => {
    expect(() => draft({ objectives: [ATTENDANCE, ATTENDANCE] })).toThrow(
      DuplicateObjectiveKeyError,
    );
    expect(() => addObjective(draft({ objectives: [ATTENDANCE] }), ATTENDANCE)).toThrow(
      DuplicateObjectiveKeyError,
    );
  });
});

describe("amendPlan", () => {
  it("restates the name and description without advancing the version", () => {
    const amended = amendPlan(draft(), { name: "  Growth 2027-30  ", description: "  Revised  " });

    expect(amended.name).toBe("Growth 2027-30");
    expect(amended.description).toBe("Revised");
    expect(amended.version).toBe(1);
  });

  it("leaves what it was not asked about alone", () => {
    const plan = draft({ description: "Three-year lift" });

    expect(amendPlan(plan, { name: "Growth 2027-30" }).description).toBe("Three-year lift");
    expect(amendPlan(plan, {}).name).toBe("Growth 2027");
  });

  it("is permitted on an active plan, whose commitments it does not touch", () => {
    expect(amendPlan(active(), { name: "Growth 2027-30" }).name).toBe("Growth 2027-30");
  });

  it("refuses a blank name", () => {
    expect(() => amendPlan(draft(), { name: "   " })).toThrow(EmptyPlanNameError);
  });

  it("refuses a plan that has been closed", () => {
    const completed = completePlan(active(), LEADER);
    const abandoned = abandonPlan(draft(), LEADER, "Superseded");

    expect(() => amendPlan(completed, { name: "Growth 2027-30" })).toThrow(
      InvalidPlanTransitionError,
    );
    expect(() => amendPlan(abandoned, { name: "Growth 2027-30" })).toThrow(
      InvalidPlanTransitionError,
    );
  });
});

describe("objectives", () => {
  it("adds an objective, advancing the version and restoring key order", () => {
    const plan = addObjective(draft({ objectives: [ABSENCE] }), ATTENDANCE);

    expect(plan.version).toBe(2);
    expect(plan.objectives.map((o) => o.objectiveKey)).toEqual([
      "attendance.rate",
      "chronic.absence",
    ]);
  });

  it("advances the version once for a batch", () => {
    expect(addObjectives(draft({ objectives: [] }), [ATTENDANCE, ABSENCE]).version).toBe(2);
  });

  it("returns the plan untouched for an empty batch", () => {
    const plan = draft();

    expect(addObjectives(plan, [])).toBe(plan);
  });

  it("accepts none of a batch when one of them is refused", () => {
    const plan = draft({ objectives: [] });

    expect(() => addObjectives(plan, [ATTENDANCE, objective({ objectiveKey: "  " })])).toThrow(
      EmptyObjectiveKeyError,
    );
    expect(objectiveCount(plan)).toBe(0);
    expect(plan.version).toBe(1);
  });

  it("refuses a duplicate within one batch as well as against the plan", () => {
    expect(() => addObjectives(draft({ objectives: [] }), [ATTENDANCE, ATTENDANCE])).toThrow(
      DuplicateObjectiveKeyError,
    );
  });

  it("restates an objective, advancing the version", () => {
    const amended = amendObjective(draft(), "attendance.rate", { targetValue: 97 });

    expect(objectiveAt(amended, "attendance.rate")?.targetValue).toBe(97);
    expect(amended.version).toBe(2);
  });

  it("returns the plan untouched where a restatement changes nothing", () => {
    const plan = draft();

    expect(amendObjective(plan, "attendance.rate", { targetValue: 96 })).toBe(plan);
    expect(amendObjective(plan, "attendance.rate", {})).toBe(plan);
  });

  it("judges a restated objective by the same rules as a declared one", () => {
    expect(() => amendObjective(draft(), "attendance.rate", { metricKey: "  " })).toThrow(
      EmptyObjectiveMetricKeyError,
    );
    expect(() => amendObjective(draft(), "attendance.rate", { targetPeriod: 12.5 })).toThrow(
      InvalidPlanPeriodError,
    );
  });

  it("removes an objective, advancing the version", () => {
    const plan = removeObjective(draft(), "attendance.rate");

    expect(plan.objectives.map((o) => o.objectiveKey)).toEqual(["chronic.absence"]);
    expect(plan.version).toBe(2);
  });

  it("refuses to amend or remove a key the plan does not carry", () => {
    expect(() => amendObjective(draft(), "retention.rate", { targetValue: 1 })).toThrow(
      ObjectiveNotFoundError,
    );
    expect(() => removeObjective(draft(), "retention.rate")).toThrow(ObjectiveNotFoundError);
  });

  it("freezes the objective set once the plan is active", () => {
    const plan = active();

    expect(() => addObjective(plan, objective({ objectiveKey: "retention.rate" }))).toThrow(
      ActivePlanObjectivesFrozenError,
    );
    expect(() => amendObjective(plan, "attendance.rate", { targetValue: 97 })).toThrow(
      ActivePlanObjectivesFrozenError,
    );
    expect(() => removeObjective(plan, "attendance.rate")).toThrow(ActivePlanObjectivesFrozenError);
  });
});

describe("activatePlan", () => {
  it("activates the plan and names who committed to it", () => {
    const plan = active();

    expect(plan.status).toBe("active");
    expect(plan.activatedByUserId).toBe(LEADER);
    expect(plan.activatedAt).not.toBeNull();
  });

  it("does not advance the version, because the commitments have not changed", () => {
    expect(active().version).toBe(1);
  });

  it("refuses a plan that commits to nothing", () => {
    expect(() => activatePlan(draft({ objectives: [] }), LEADER)).toThrow(
      PlanWithoutObjectivesError,
    );
  });

  it("reports the empty plan rather than the missing signature", () => {
    expect(() => activatePlan(draft({ objectives: [] }), null)).toThrow(PlanWithoutObjectivesError);
  });

  it("refuses an anonymous activation", () => {
    expect(() => activatePlan(draft(), null)).toThrow(AnonymousPlanReviewError);
  });

  it("refuses a plan that is not a draft", () => {
    expect(() => activatePlan(active(), LEADER)).toThrow(InvalidPlanTransitionError);
  });
});

describe("recordProgress", () => {
  it("appends readings in the order they arrived", () => {
    const plan = onLine(active());

    expect(plan.progress.map((reading) => reading.objectiveKey)).toEqual([
      "attendance.rate",
      "chronic.absence",
    ]);
  });

  it("normalizes the objective key and rounds the reading", () => {
    const plan = recordProgress(active(), [
      { objectiveKey: " Attendance.Rate ", period: 6, actualValue: 93.98765432 },
    ]);

    expect(plan.progress).toEqual([
      { objectiveKey: "attendance.rate", period: 6, actualValue: 93.987654 },
    ]);
  });

  it("returns the plan untouched for an empty batch", () => {
    const plan = active();

    expect(recordProgress(plan, [])).toBe(plan);
  });

  it("takes the later of two readings at one period, keeping both on the record", () => {
    const corrected = recordProgress(onLine(active()), [
      { objectiveKey: "attendance.rate", period: 6, actualValue: 90 },
    ]);

    expect(corrected.progress.map((reading) => reading.actualValue)).toEqual([93, 15, 90]);
    expect(stateOf(corrected, 6, "attendance.rate")).toBe("off_track");
  });

  it("refuses a reading against an objective the plan does not carry", () => {
    expect(() =>
      recordProgress(active(), [{ objectiveKey: "retention.rate", period: 6, actualValue: 1 }]),
    ).toThrow(ObjectiveNotFoundError);
  });

  it("refuses a period that is not a whole index", () => {
    expect(() =>
      recordProgress(active(), [{ objectiveKey: "attendance.rate", period: 6.5, actualValue: 93 }]),
    ).toThrow(InvalidPlanPeriodError);
  });

  it("refuses a non-finite reading", () => {
    expect(() =>
      recordProgress(active(), [
        { objectiveKey: "attendance.rate", period: 6, actualValue: Number.NaN },
      ]),
    ).toThrow(NonFiniteObjectiveValueError);
  });

  it("records none of a batch when one reading is refused", () => {
    const plan = active();

    expect(() =>
      recordProgress(plan, [
        { objectiveKey: "attendance.rate", period: 6, actualValue: 93 },
        { objectiveKey: "retention.rate", period: 6, actualValue: 1 },
      ]),
    ).toThrow(ObjectiveNotFoundError);
    expect(plan.progress).toEqual([]);
  });

  it("refuses a plan the institution is not operating under", () => {
    expect(() =>
      recordProgress(draft(), [{ objectiveKey: "attendance.rate", period: 6, actualValue: 93 }]),
    ).toThrow(PlanNotActiveError);
    expect(() =>
      recordProgress(completePlan(active(), LEADER), [
        { objectiveKey: "attendance.rate", period: 6, actualValue: 93 },
      ]),
    ).toThrow(PlanNotActiveError);
  });
});

describe("reviewPlan", () => {
  it("keeps the variance it computed, beside the version it was computed against", () => {
    const reviewed = reviewPlan(onLine(active()), { period: 6, reviewedByUserId: LEADER });
    const review = latestReview(reviewed);

    expect(review?.period).toBe(6);
    expect(review?.planVersion).toBe(1);
    expect(review?.reviewedByUserId).toBe(LEADER);
    expect(review?.variance.state).toBe("on_track");
    expect(review?.variance.onTrackCount).toBe(2);
    expect(review?.variance.objectives.map((v) => v.expectedValue)).toEqual([93, 15]);
  });

  it("does not move when later readings change the plan's position", () => {
    const reviewed = reviewPlan(onLine(active()), { period: 6, reviewedByUserId: LEADER });
    const later = recordProgress(reviewed, [
      { objectiveKey: "attendance.rate", period: 6, actualValue: 90 },
    ]);

    expect(latestReview(later)?.variance.state).toBe("on_track");
    expect(planVarianceAt(later, 6).state).toBe("off_track");
  });

  it("trims a note and keeps null where none was given", () => {
    const plan = onLine(active());

    expect(
      latestReview(reviewPlan(plan, { period: 6, reviewedByUserId: LEADER, note: "  Holding  " }))
        ?.note,
    ).toBe("Holding");
    expect(
      latestReview(reviewPlan(plan, { period: 6, reviewedByUserId: LEADER }))?.note,
    ).toBeNull();
  });

  it("accumulates reviews in the order they were taken", () => {
    const first = reviewPlan(onLine(active()), { period: 6, reviewedByUserId: LEADER });
    const second = reviewPlan(first, { period: 9, reviewedByUserId: LEADER });

    expect(second.reviews.map((review) => review.period)).toEqual([6, 9]);
    expect(latestReview(second)?.period).toBe(9);
  });

  it("refuses an anonymous review", () => {
    expect(() => reviewPlan(active(), { period: 6, reviewedByUserId: null })).toThrow(
      AnonymousPlanReviewError,
    );
  });

  it("refuses a period that is not a whole index", () => {
    expect(() => reviewPlan(active(), { period: 6.5, reviewedByUserId: LEADER })).toThrow(
      InvalidPlanPeriodError,
    );
  });

  it("refuses a plan the institution is not operating under", () => {
    expect(() => reviewPlan(draft(), { period: 6, reviewedByUserId: LEADER })).toThrow(
      PlanNotActiveError,
    );
  });
});

describe("closing a plan", () => {
  it("completes an active plan and names who closed it", () => {
    const completed = completePlan(active(), LEADER);

    expect(completed.status).toBe("completed");
    expect(completed.closedByUserId).toBe(LEADER);
    expect(completed.closedAt).not.toBeNull();
    expect(completed.abandonmentReason).toBeNull();
  });

  it("completes a plan whose objectives were missed, because that is an outcome too", () => {
    const completed = completePlan(active(), LEADER);

    expect(planVarianceAt(completed, 12).missedCount).toBe(2);
    expect(completed.status).toBe("completed");
  });

  it("refuses an anonymous completion, and a plan that is not active", () => {
    expect(() => completePlan(active(), null)).toThrow(AnonymousPlanReviewError);
    expect(() => completePlan(draft(), LEADER)).toThrow(InvalidPlanTransitionError);
  });

  it("abandons a draft that was never adopted", () => {
    const abandoned = abandonPlan(draft(), LEADER, "  Superseded by the trust's own plan  ");

    expect(abandoned.status).toBe("abandoned");
    expect(abandoned.closedByUserId).toBe(LEADER);
    expect(abandoned.abandonmentReason).toBe("Superseded by the trust's own plan");
  });

  it("abandons an active plan and keeps its readings", () => {
    const abandoned = abandonPlan(onLine(active()), LEADER, "Funding withdrawn");

    expect(abandoned.status).toBe("abandoned");
    expect(abandoned.progress).toHaveLength(2);
  });

  it("stores no reason where none was given", () => {
    expect(abandonPlan(draft(), LEADER, null).abandonmentReason).toBeNull();
    expect(abandonPlan(draft(), LEADER, "   ").abandonmentReason).toBeNull();
  });

  it("refuses an anonymous abandonment, and a plan already closed", () => {
    expect(() => abandonPlan(draft(), null, "Superseded")).toThrow(AnonymousPlanReviewError);
    expect(() => abandonPlan(completePlan(active(), LEADER), LEADER, "Superseded")).toThrow(
      InvalidPlanTransitionError,
    );
  });
});

describe("guards", () => {
  it("refuses a plan key already taken, however it was cased", () => {
    expect(() => guardPlanKeyAvailable("  Growth.2027 ", ["growth.2027"])).toThrow(
      DuplicatePlanKeyError,
    );
    expect(() => guardPlanKeyAvailable("growth.2030", ["growth.2027"])).not.toThrow();
  });

  it("returns an active plan and refuses anything else", () => {
    const plan = active();

    expect(requireActivePlan(plan)).toBe(plan);
    expect(() => requireActivePlan(draft())).toThrow(PlanNotActiveError);
  });
});

describe("reading", () => {
  it("finds an objective by its normalized key", () => {
    expect(objectiveAt(draft(), " Attendance.Rate ")?.targetValue).toBe(96);
    expect(objectiveAt(draft(), "retention.rate")).toBeNull();
    expect(objectiveCount(draft())).toBe(2);
  });

  it("scores an objective nobody has measured at its baseline", () => {
    const variance = planVarianceAt(active(), 6);

    expect(variance.objectives.map((v) => v.actualValue)).toEqual([90, 20]);
    expect(variance.offTrackCount).toBe(2);
    expect(variance.state).toBe("off_track");
  });

  it("takes the plan's state from its worst objective", () => {
    const plan = recordProgress(active(), [
      { objectiveKey: "attendance.rate", period: 6, actualValue: 92.4 },
      { objectiveKey: "chronic.absence", period: 6, actualValue: 15 },
    ]);
    const variance = planVarianceAt(plan, 6);

    expect(stateOf(plan, 6, "attendance.rate")).toBe("at_risk");
    expect(stateOf(plan, 6, "chronic.absence")).toBe("on_track");
    expect(variance.onTrackCount).toBe(1);
    expect(variance.atRiskCount).toBe(1);
    expect(variance.state).toBe("at_risk");
  });

  it("counts a target met as achieved, whichever way the metric moves", () => {
    const plan = recordProgress(active(), [
      { objectiveKey: "attendance.rate", period: 6, actualValue: 97 },
      { objectiveKey: "chronic.absence", period: 6, actualValue: 9 },
    ]);

    expect(planVarianceAt(plan, 6).achievedCount).toBe(2);
    expect(planVarianceAt(plan, 6).state).toBe("achieved");
  });

  it("names the objectives with no reading at or before a period", () => {
    const plan = recordProgress(active(), [
      { objectiveKey: "attendance.rate", period: 6, actualValue: 93 },
    ]);

    expect(unmeasuredObjectiveKeys(plan, 6)).toEqual(["chronic.absence"]);
    expect(unmeasuredObjectiveKeys(plan, 5)).toEqual(["attendance.rate", "chronic.absence"]);
    expect(unmeasuredObjectiveKeys(onLine(active()), 6)).toEqual([]);
  });

  it("reports the latest review, or none", () => {
    expect(latestReview(active())).toBeNull();
    expect(
      latestReview(reviewPlan(onLine(active()), { period: 6, reviewedByUserId: LEADER }))?.period,
    ).toBe(6);
  });

  it("says whether the institution is operating under the plan", () => {
    expect(isPlanOperating(draft())).toBe(false);
    expect(isPlanOperating(active())).toBe(true);
    expect(isPlanOperating(completePlan(active(), LEADER))).toBe(false);
  });

  it("refers to the plan by key and objective-set version", () => {
    expect(planReference(active())).toEqual({ planKey: "growth.2027", planVersion: 1 });
    expect(planReference(removeObjective(draft(), "attendance.rate"))).toEqual({
      planKey: "growth.2027",
      planVersion: 2,
    });
  });
});
