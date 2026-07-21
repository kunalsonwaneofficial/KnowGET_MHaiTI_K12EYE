import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { EmptySupportEntryError, SupportGoalNotFoundError } from "./errors";
import {
  activateSupportPlan,
  addSupportGoal,
  archiveSupportPlan,
  createLearnerSupportPlan,
  recordReview,
  removeSupportGoal,
  setAcademicAccommodations,
  setInclusionStrategies,
  setReviewSchedule,
  updateSupportGoalStatus,
} from "./learner-support-plan";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;

const plan = () =>
  createLearnerSupportPlan({ tenantId: TENANT, organizationId: ORG, studentId: STUDENT });

describe("learner support plan aggregate", () => {
  it("creates an active empty plan bound to the student and organization", () => {
    const p = plan();
    expect(p.status).toBe("active");
    expect(p.academicAccommodations).toEqual([]);
    expect(p.goals).toEqual([]);
    expect(p.reviewSchedule).toEqual({
      frequency: null,
      nextReviewOn: null,
      lastReviewedOn: null,
    });
  });

  it("normalizes accommodation and strategy lists", () => {
    const p = setAcademicAccommodations(plan(), [" extra time ", "extra time", "  ", "scribe"]);
    expect(p.academicAccommodations).toEqual(["extra time", "scribe"]);
    expect(setInclusionStrategies(p, ["buddy system"]).inclusionStrategies).toEqual([
      "buddy system",
    ]);
  });

  it("adds, transitions and removes personalized goals", () => {
    const { plan: p0, goal } = addSupportGoal(plan(), {
      description: " read fluently ",
      targetDate: "2026-12-01",
    });
    expect(goal.description).toBe("read fluently");
    expect(goal.targetDate).toBe("2026-12-01");
    const achieved = updateSupportGoalStatus(p0, goal.id, "achieved");
    expect(achieved.goals[0]?.status).toBe("achieved");
    expect(removeSupportGoal(achieved, goal.id).goals).toEqual([]);
    expect(() => addSupportGoal(plan(), { description: "  " })).toThrow(EmptySupportEntryError);
    expect(() => updateSupportGoalStatus(plan(), goal.id, "achieved")).toThrow(
      SupportGoalNotFoundError,
    );
  });

  it("manages the review schedule and records reviews", () => {
    const scheduled = setReviewSchedule(plan(), {
      frequency: "termly",
      nextReviewOn: "2026-09-01",
    });
    expect(scheduled.reviewSchedule.frequency).toBe("termly");
    expect(scheduled.reviewSchedule.nextReviewOn).toBe("2026-09-01");
    const reviewed = recordReview(scheduled, "2026-06-01");
    expect(reviewed.reviewSchedule.lastReviewedOn).toBe("2026-06-01");
  });

  it("archives and reactivates the plan", () => {
    const archived = archiveSupportPlan(plan());
    expect(archived.status).toBe("archived");
    expect(activateSupportPlan(archived).status).toBe("active");
  });
});
