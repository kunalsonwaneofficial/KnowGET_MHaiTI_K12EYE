import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { BehaviourRecordService } from "./behaviour-record-service";
import {
  BehaviourRecordNotFoundError,
  DuplicateBehaviourRecordError,
  PersonNotFoundForWellbeingError,
  StudentNotFoundForWellbeingError,
} from "./errors";
import {
  InMemoryBehaviourRecordRepository,
  type PersonDirectory,
  type StudentDirectory,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;
const STAFF = "44444444-4444-4444-4444-444444444444" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

const students: StudentDirectory = {
  organizationOf: async (_t, id) => (id === STUDENT ? ORG : null),
};
const persons: PersonDirectory = { exists: async (_t, id) => id === STAFF };

function service(): { svc: BehaviourRecordService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const svc = new BehaviourRecordService({
    repository: new InMemoryBehaviourRecordRepository(),
    students,
    persons,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

describe("BehaviourRecordService", () => {
  it("creates a record, deriving the organization from the student", async () => {
    const { svc } = service();
    const r = await svc.create({ tenantId: TENANT, studentId: STUDENT });
    expect(r.organizationId).toBe(ORG);
    expect(await svc.getByStudent(TENANT, STUDENT)).toEqual(r);
    expect(await svc.listForOrganization(TENANT, ORG)).toHaveLength(1);
  });

  it("rejects an unknown student and a duplicate record", async () => {
    const { svc } = service();
    await expect(svc.create({ tenantId: TENANT, studentId: UNKNOWN })).rejects.toBeInstanceOf(
      StudentNotFoundForWellbeingError,
    );
    await svc.create({ tenantId: TENANT, studentId: STUDENT });
    await expect(svc.create({ tenantId: TENANT, studentId: STUDENT })).rejects.toBeInstanceOf(
      DuplicateBehaviourRecordError,
    );
  });

  it("records an observation from a validated staff member and publishes the event", async () => {
    const { svc, events } = service();
    const r = await svc.create({ tenantId: TENANT, studentId: STUDENT });
    const { observation } = await svc.recordObservation(TENANT, r.id, {
      type: "positive",
      note: "helped a peer",
      observedBy: STAFF,
    });
    expect(observation.type).toBe("positive");
    expect(events.map((e) => e.type)).toEqual(["wellbeing.behaviour_observation.recorded"]);
    await expect(
      svc.recordObservation(TENANT, r.id, { type: "neutral", note: "n", observedBy: UNKNOWN }),
    ).rejects.toBeInstanceOf(PersonNotFoundForWellbeingError);
  });

  it("reports an incident and manages restorative actions through to resolution", async () => {
    const { svc, events } = service();
    const r = await svc.create({ tenantId: TENANT, studentId: STUDENT });
    const { incident } = await svc.reportIncident(TENANT, r.id, {
      category: "disruption",
      severity: "moderate",
      description: "left class",
      reportedBy: STAFF,
    });
    expect(events.at(-1)?.type).toBe("wellbeing.behaviour_incident.reported");
    await svc.updateIncidentStatus(TENANT, r.id, incident.id, "under_review");
    const { action } = await svc.addRestorativeAction(
      TENANT,
      r.id,
      incident.id,
      "reflective conversation",
    );
    await svc.completeRestorativeAction(TENANT, r.id, incident.id, action.id);
    const resolved = await svc.updateIncidentStatus(TENANT, r.id, incident.id, "resolved");
    expect(resolved.incidents[0]?.status).toBe("resolved");
    expect(resolved.incidents[0]?.restorativeActions[0]?.completedAt).not.toBeNull();
    await expect(
      svc.reportIncident(TENANT, r.id, {
        category: "x",
        severity: "minor",
        description: "y",
        reportedBy: UNKNOWN,
      }),
    ).rejects.toBeInstanceOf(PersonNotFoundForWellbeingError);
  });

  it("manages developmental goals and the improvement plan", async () => {
    const { svc } = service();
    const r = await svc.create({ tenantId: TENANT, studentId: STUDENT });
    const { goal } = await svc.setGoal(TENANT, r.id, "arrive on time");
    const achieved = await svc.updateGoalStatus(TENANT, r.id, goal.id, "achieved");
    expect(achieved.goals[0]?.status).toBe("achieved");
    await svc.setImprovementPlan(TENANT, r.id, {
      strategies: ["mentoring"],
      reviewOn: "2026-09-01",
    });
    const cleared = await svc.removeGoal(TENANT, r.id, goal.id);
    expect(cleared.goals).toEqual([]);
    expect(cleared.improvementPlan?.strategies).toEqual(["mentoring"]);
    const noPlan = await svc.clearImprovementPlan(TENANT, r.id);
    expect(noPlan.improvementPlan).toBeNull();
    await expect(svc.getById(TENANT, UNKNOWN)).rejects.toBeInstanceOf(BehaviourRecordNotFoundError);
  });
});
