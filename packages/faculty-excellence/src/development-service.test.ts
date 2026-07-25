import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { DevelopmentService } from "./development-service";
import { DuplicateRequirementError, EmployeeNotFoundForFacultyError } from "./errors";
import {
  type EmployeeDirectory,
  InMemoryDevelopmentRequirementRepository,
  InMemoryProfessionalLearningActivityRepository,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const EMPLOYEE = "33333333-3333-3333-3333-333333333333" as Uuid;

const employees: EmployeeDirectory = {
  exists: async (_t, id) => id === EMPLOYEE,
  organizationOf: async (_t, id) => (id === EMPLOYEE ? ORG : null),
};

function service(): { svc: DevelopmentService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const svc = new DevelopmentService({
    requirements: new InMemoryDevelopmentRequirementRepository(),
    activities: new InMemoryProfessionalLearningActivityRepository(),
    employees,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

describe("DevelopmentService", () => {
  it("sets requirements (one per category per period), deriving org; rejects an unknown employee", async () => {
    const { svc } = service();
    const req = await svc.setRequirement({
      tenantId: TENANT,
      employeeId: EMPLOYEE,
      category: "pedagogy",
      period: "2026",
      requiredHours: 20,
    });
    expect(req.organizationId).toBe(ORG);
    await expect(
      svc.setRequirement({
        tenantId: TENANT,
        employeeId: EMPLOYEE,
        category: "pedagogy",
        period: "2026",
        requiredHours: 15,
      }),
    ).rejects.toBeInstanceOf(DuplicateRequirementError);
    await expect(
      svc.setRequirement({
        tenantId: TENANT,
        employeeId: "00000000-0000-0000-0000-000000000000" as Uuid,
        category: "compliance",
        period: "2026",
        requiredHours: 10,
      }),
    ).rejects.toBeInstanceOf(EmployeeNotFoundForFacultyError);
  });

  it("reconciles requirements and completed activities into a compliance ledger", async () => {
    const { svc, events } = service();
    await svc.setRequirement({
      tenantId: TENANT,
      employeeId: EMPLOYEE,
      category: "pedagogy",
      period: "2026",
      requiredHours: 20,
    });

    const done = await svc.plan({
      tenantId: TENANT,
      employeeId: EMPLOYEE,
      title: "Coaching for questioning",
      category: "pedagogy",
      hours: 12,
      startDate: "2026-03-01",
    });
    await svc.complete(TENANT, done.id);

    await svc.plan({
      tenantId: TENANT,
      employeeId: EMPLOYEE,
      title: "Planned but not done",
      category: "pedagogy",
      hours: 5,
      startDate: "2026-07-01",
    }); // stays planned → not counted

    const ledger = await svc.computeLedger(TENANT, EMPLOYEE, "2026");
    const pedagogy = ledger.lines.find((l) => l.category === "pedagogy");
    expect(pedagogy).toEqual({
      category: "pedagogy",
      required: 20,
      completed: 12,
      remaining: 8,
      compliancePct: 60, // 100 * 12 / 20
    });
    expect(ledger.complianceRate).toBe(60);

    expect(events.map((e) => e.type)).toEqual([
      "faculty.pd.planned",
      "faculty.pd.completed",
      "faculty.pd.planned",
    ]);
  });

  it("scopes the ledger to the requested period", async () => {
    const { svc } = service();
    await svc.setRequirement({
      tenantId: TENANT,
      employeeId: EMPLOYEE,
      category: "digital",
      period: "2027",
      requiredHours: 15,
    });
    expect((await svc.computeLedger(TENANT, EMPLOYEE, "2026")).totalRequired).toBe(0);
    expect((await svc.computeLedger(TENANT, EMPLOYEE, "2027")).totalRequired).toBe(15);
  });
});
