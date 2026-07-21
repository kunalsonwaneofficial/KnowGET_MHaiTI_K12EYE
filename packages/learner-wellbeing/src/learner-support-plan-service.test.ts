import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  DuplicateSupportPlanError,
  StudentNotFoundForWellbeingError,
  SupportPlanNotFoundError,
} from "./errors";
import { LearnerSupportPlanService } from "./learner-support-plan-service";
import { InMemoryLearnerSupportPlanRepository, type StudentDirectory } from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

const students: StudentDirectory = {
  organizationOf: async (_t, id) => (id === STUDENT ? ORG : null),
};

function service(): { svc: LearnerSupportPlanService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const svc = new LearnerSupportPlanService({
    repository: new InMemoryLearnerSupportPlanRepository(),
    students,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

describe("LearnerSupportPlanService", () => {
  it("creates a plan, deriving the organization and publishing support_plan.updated", async () => {
    const { svc, events } = service();
    const p = await svc.create({ tenantId: TENANT, studentId: STUDENT });
    expect(p.organizationId).toBe(ORG);
    expect(events.map((e) => e.type)).toEqual(["wellbeing.support_plan.updated"]);
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
      DuplicateSupportPlanError,
    );
  });

  it("publishes support_plan.updated on each accommodation, goal and review change", async () => {
    const { svc, events } = service();
    const p = await svc.create({ tenantId: TENANT, studentId: STUDENT });
    await svc.setAcademicAccommodations(TENANT, p.id, ["extra time"]);
    await svc.setMedicalAccommodations(TENANT, p.id, ["inhaler access"]);
    const { goal } = await svc.addGoal(TENANT, p.id, { description: "read fluently" });
    await svc.updateGoalStatus(TENANT, p.id, goal.id, "achieved");
    await svc.setReviewSchedule(TENANT, p.id, { frequency: "termly" });
    const reviewed = await svc.recordReview(TENANT, p.id, "2026-06-01");
    expect(reviewed.academicAccommodations).toEqual(["extra time"]);
    expect(reviewed.medicalAccommodations).toEqual(["inhaler access"]);
    expect(reviewed.goals[0]?.status).toBe("achieved");
    expect(reviewed.reviewSchedule.lastReviewedOn).toBe("2026-06-01");
    // 1 create + 6 mutations
    expect(events.filter((e) => e.type === "wellbeing.support_plan.updated")).toHaveLength(7);
  });

  it("archives and reactivates, and reports a missing plan", async () => {
    const { svc } = service();
    const p = await svc.create({ tenantId: TENANT, studentId: STUDENT });
    const archived = await svc.archive(TENANT, p.id);
    expect(archived.status).toBe("archived");
    expect((await svc.activate(TENANT, p.id)).status).toBe("active");
    await expect(svc.getById(TENANT, UNKNOWN)).rejects.toBeInstanceOf(SupportPlanNotFoundError);
  });
});
