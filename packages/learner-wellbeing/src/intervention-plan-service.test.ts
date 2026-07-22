import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  DuplicateInterventionPlanError,
  InterventionPlanNotFoundError,
  PersonNotFoundForWellbeingError,
  StudentNotFoundForWellbeingError,
} from "./errors";
import { InterventionPlanService } from "./intervention-plan-service";
import {
  InMemoryInterventionPlanRepository,
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

function service(): { svc: InterventionPlanService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const svc = new InterventionPlanService({
    repository: new InMemoryInterventionPlanRepository(),
    students,
    persons,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

describe("InterventionPlanService", () => {
  it("creates a plan, deriving the organization from the student", async () => {
    const { svc } = service();
    const p = await svc.create({ tenantId: TENANT, studentId: STUDENT });
    expect(p.organizationId).toBe(ORG);
    expect(await svc.getByStudent(TENANT, STUDENT)).toEqual(p);
    expect(await svc.listForOrganization(TENANT, ORG)).toHaveLength(1);
  });

  it("rejects an unknown student and a duplicate plan", async () => {
    const { svc } = service();
    await expect(svc.create({ tenantId: TENANT, studentId: UNKNOWN })).rejects.toBeInstanceOf(
      StudentNotFoundForWellbeingError,
    );
    await svc.create({ tenantId: TENANT, studentId: STUDENT });
    await expect(svc.create({ tenantId: TENANT, studentId: STUDENT })).rejects.toBeInstanceOf(
      DuplicateInterventionPlanError,
    );
  });

  it("assigns an intervention to validated staff and publishes intervention.assigned", async () => {
    const { svc, events } = service();
    const p = await svc.create({ tenantId: TENANT, studentId: STUDENT });
    await svc.setEarlyWarningTriggers(TENANT, p.id, ["attendance drop"]);
    const { intervention } = await svc.assignIntervention(TENANT, p.id, {
      description: "weekly mentoring",
      responsibleStaff: STAFF,
    });
    expect(intervention.status).toBe("assigned");
    expect(events.map((e) => e.type)).toEqual(["wellbeing.intervention.assigned"]);
    await expect(
      svc.assignIntervention(TENANT, p.id, { description: "x", responsibleStaff: UNKNOWN }),
    ).rejects.toBeInstanceOf(PersonNotFoundForWellbeingError);
  });

  it("drives progress monitoring and completion, publishing intervention.completed", async () => {
    const { svc, events } = service();
    const p = await svc.create({ tenantId: TENANT, studentId: STUDENT });
    const { intervention } = await svc.assignIntervention(TENANT, p.id, {
      description: "mentoring",
      responsibleStaff: STAFF,
    });
    await svc.startIntervention(TENANT, p.id, intervention.id);
    await svc.recordProgress(TENANT, p.id, intervention.id, {
      note: "engaging well",
      recordedBy: STAFF,
    });
    const { intervention: done } = await svc.completeIntervention(
      TENANT,
      p.id,
      intervention.id,
      "goals met",
    );
    expect(done.status).toBe("completed");
    expect(done.outcome).toBe("goals met");
    expect(events.at(-1)?.type).toBe("wellbeing.intervention.completed");
    await expect(
      svc.recordProgress(TENANT, p.id, intervention.id, { note: "n", recordedBy: UNKNOWN }),
    ).rejects.toBeInstanceOf(PersonNotFoundForWellbeingError);
  });

  it("cancels an intervention and reports a missing plan", async () => {
    const { svc } = service();
    const p = await svc.create({ tenantId: TENANT, studentId: STUDENT });
    const { intervention } = await svc.assignIntervention(TENANT, p.id, {
      description: "check-ins",
      responsibleStaff: STAFF,
    });
    const cancelled = await svc.cancelIntervention(TENANT, p.id, intervention.id);
    expect(cancelled.interventions[0]?.status).toBe("cancelled");
    await expect(svc.getById(TENANT, UNKNOWN)).rejects.toBeInstanceOf(
      InterventionPlanNotFoundError,
    );
  });
});
