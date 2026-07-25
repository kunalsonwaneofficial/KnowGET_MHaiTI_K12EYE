import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { DevelopmentGoalService } from "./development-goal-service";
import { EmployeeNotFoundForFacultyError } from "./errors";
import { type EmployeeDirectory, InMemoryDevelopmentGoalRepository } from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const EMPLOYEE = "33333333-3333-3333-3333-333333333333" as Uuid;

const employees: EmployeeDirectory = {
  exists: async (_t, id) => id === EMPLOYEE,
  organizationOf: async (_t, id) => (id === EMPLOYEE ? ORG : null),
};

function service(): { svc: DevelopmentGoalService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const svc = new DevelopmentGoalService({
    repository: new InMemoryDevelopmentGoalRepository(),
    employees,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

describe("DevelopmentGoalService", () => {
  it("drafts against an employee (deriving org) and runs the lifecycle with events", async () => {
    const { svc, events } = service();
    const goal = await svc.draft({
      tenantId: TENANT,
      employeeId: EMPLOYEE,
      description: "Improve questioning",
    });
    expect(goal.organizationId).toBe(ORG);
    await svc.activate(TENANT, goal.id);
    const achieved = await svc.achieve(TENANT, goal.id, "Done");
    expect(achieved.status).toBe("achieved");
    expect(events.map((e) => e.type)).toEqual(["faculty.goal.activated", "faculty.goal.achieved"]);
    expect(await svc.listForEmployee(TENANT, EMPLOYEE)).toHaveLength(1);
  });

  it("rejects an unknown employee", async () => {
    const { svc } = service();
    await expect(
      svc.draft({
        tenantId: TENANT,
        employeeId: "00000000-0000-0000-0000-000000000000" as Uuid,
        description: "x",
      }),
    ).rejects.toBeInstanceOf(EmployeeNotFoundForFacultyError);
  });
});
