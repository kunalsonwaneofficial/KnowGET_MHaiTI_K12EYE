import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  addRestorativeAction,
  clearImprovementPlan,
  completeRestorativeAction,
  createBehaviourRecord,
  recordObservation,
  removeBehaviourGoal,
  removeObservation,
  reportIncident,
  setBehaviourGoal,
  setImprovementPlan,
  updateBehaviourGoalStatus,
  updateIncidentStatus,
} from "./behaviour-record";
import {
  BehaviourGoalNotFoundError,
  BehaviourIncidentNotFoundError,
  BehaviourObservationNotFoundError,
  EmptyBehaviourEntryError,
  RestorativeActionNotFoundError,
} from "./errors";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;
const STAFF = "44444444-4444-4444-4444-444444444444" as Uuid;

const record = () =>
  createBehaviourRecord({ tenantId: TENANT, organizationId: ORG, studentId: STUDENT });

describe("behaviour record aggregate", () => {
  it("creates an empty record bound to the student and organization", () => {
    const r = record();
    expect(r.organizationId).toBe(ORG);
    expect(r.studentId).toBe(STUDENT);
    expect(r.observations).toEqual([]);
    expect(r.incidents).toEqual([]);
    expect(r.goals).toEqual([]);
    expect(r.improvementPlan).toBeNull();
  });

  it("records positive recognitions and removes observations", () => {
    const { record: r, observation } = recordObservation(record(), {
      type: "positive",
      note: " helped a peer ",
      observedBy: STAFF,
    });
    expect(observation.type).toBe("positive");
    expect(observation.note).toBe("helped a peer");
    expect(r.observations).toHaveLength(1);
    const removed = removeObservation(r, observation.id);
    expect(removed.observations).toEqual([]);
    expect(() => removeObservation(record(), observation.id)).toThrow(
      BehaviourObservationNotFoundError,
    );
    expect(() =>
      recordObservation(record(), { type: "neutral", note: "  ", observedBy: STAFF }),
    ).toThrow(EmptyBehaviourEntryError);
  });

  it("reports incidents and drives their review lifecycle with restorative actions", () => {
    const { record: r0, incident } = reportIncident(record(), {
      category: "disruption",
      severity: "moderate",
      description: "left class without permission",
      reportedBy: STAFF,
    });
    expect(incident.status).toBe("reported");
    const underReview = updateIncidentStatus(r0, incident.id, "under_review");
    expect(underReview.incidents[0]?.status).toBe("under_review");
    const { record: r1, action } = addRestorativeAction(
      underReview,
      incident.id,
      "reflective conversation",
    );
    expect(r1.incidents[0]?.restorativeActions).toHaveLength(1);
    const completed = completeRestorativeAction(r1, incident.id, action.id);
    expect(completed.incidents[0]?.restorativeActions[0]?.completedAt).not.toBeNull();
    const resolved = updateIncidentStatus(completed, incident.id, "resolved");
    expect(resolved.incidents[0]?.status).toBe("resolved");
  });

  it("rejects unknown incidents and restorative actions", () => {
    const { record: r, incident } = reportIncident(record(), {
      category: "x",
      severity: "minor",
      description: "y",
      reportedBy: STAFF,
    });
    expect(() => updateIncidentStatus(record(), incident.id, "resolved")).toThrow(
      BehaviourIncidentNotFoundError,
    );
    expect(() => completeRestorativeAction(r, incident.id, STUDENT)).toThrow(
      RestorativeActionNotFoundError,
    );
    expect(() =>
      reportIncident(record(), {
        category: " ",
        severity: "minor",
        description: "y",
        reportedBy: STAFF,
      }),
    ).toThrow(EmptyBehaviourEntryError);
  });

  it("sets, transitions and removes developmental goals", () => {
    const { record: r0, goal } = setBehaviourGoal(record(), "arrive on time daily");
    expect(goal.status).toBe("active");
    const achieved = updateBehaviourGoalStatus(r0, goal.id, "achieved");
    expect(achieved.goals[0]?.status).toBe("achieved");
    const removed = removeBehaviourGoal(achieved, goal.id);
    expect(removed.goals).toEqual([]);
    expect(() => updateBehaviourGoalStatus(record(), goal.id, "achieved")).toThrow(
      BehaviourGoalNotFoundError,
    );
    expect(() => removeBehaviourGoal(record(), goal.id)).toThrow(BehaviourGoalNotFoundError);
  });

  it("sets and clears the improvement plan, normalizing strategies", () => {
    const r = setImprovementPlan(record(), {
      strategies: [" check-in ", "check-in", "  ", "mentoring"],
      reviewOn: "2026-09-01",
      notes: " weekly ",
    });
    expect(r.improvementPlan?.strategies).toEqual(["check-in", "mentoring"]);
    expect(r.improvementPlan?.reviewOn).toBe("2026-09-01");
    expect(r.improvementPlan?.notes).toBe("weekly");
    expect(clearImprovementPlan(r).improvementPlan).toBeNull();
  });
});
