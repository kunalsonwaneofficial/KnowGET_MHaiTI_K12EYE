import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { type Employee, onboardEmployee } from "./employee";
import { EmployeeNotFoundError } from "./errors";
import { InMemoryEmployeeRepository, InMemoryPerformanceReviewRepository } from "./ports";
import { PerformanceReviewService } from "./performance-review-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const PERSON = "33333333-3333-3333-3333-333333333333" as Uuid;

async function harness(): Promise<{
  svc: PerformanceReviewService;
  employee: Employee;
  events: DomainEvent[];
}> {
  const employees = new InMemoryEmployeeRepository();
  const employee = onboardEmployee({
    tenantId: TENANT,
    organizationId: ORG,
    personId: PERSON,
    employeeNumber: "E-1",
    employmentType: "full_time",
  });
  await employees.save(employee);
  const events: DomainEvent[] = [];
  const svc = new PerformanceReviewService({
    repository: new InMemoryPerformanceReviewRepository(),
    employees,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, employee, events };
}

describe("PerformanceReviewService", () => {
  it("drafts against an employee, deriving the organization; rejects an unknown employee", async () => {
    const { svc, employee } = await harness();
    const review = await svc.draft({
      tenantId: TENANT,
      employeeId: employee.id,
      period: "2026-H1",
    });
    expect(review.organizationId).toBe(ORG);
    expect(review.status).toBe("draft");
    await expect(
      svc.draft({
        tenantId: TENANT,
        employeeId: "00000000-0000-0000-0000-000000000000" as Uuid,
        period: "2026-H1",
      }),
    ).rejects.toBeInstanceOf(EmployeeNotFoundError);
  });

  it("runs the review lifecycle and publishes submitted and finalized events", async () => {
    const { svc, employee, events } = await harness();
    const review = await svc.draft({
      tenantId: TENANT,
      employeeId: employee.id,
      period: "2026-H1",
    });
    await svc.setRating(TENANT, review.id, 4);
    await svc.submit(TENANT, review.id);
    await svc.acknowledge(TENANT, review.id);
    const finalized = await svc.finalize(TENANT, review.id);
    expect(finalized.status).toBe("finalized");
    expect(events.map((e) => e.type)).toEqual([
      "workforce.review.submitted",
      "workforce.review.finalized",
    ]);
    expect(await svc.listForEmployee(TENANT, employee.id)).toHaveLength(1);
  });
});
