import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { type Employee, onboardEmployee } from "./employee";
import { EmploymentContractService } from "./employment-contract-service";
import {
  ContractNotEditableError,
  EmployeeNotFoundError,
  InvalidContractTransitionError,
} from "./errors";
import { InMemoryEmployeeRepository, InMemoryEmploymentContractRepository } from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const PERSON = "33333333-3333-3333-3333-333333333333" as Uuid;

async function harness(): Promise<{
  svc: EmploymentContractService;
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
  const svc = new EmploymentContractService({
    repository: new InMemoryEmploymentContractRepository(),
    employees,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, employee, events };
}

const issue = (employeeId: Uuid) =>
  ({
    tenantId: TENANT,
    employeeId,
    employmentType: "full_time" as const,
    startDate: "2026-01-15",
    grade: "PGT-II",
  }) as const;

describe("EmploymentContractService", () => {
  it("issues versioned contracts deriving org and version, and rejects an unknown employee", async () => {
    const { svc, employee } = await harness();
    const v1 = await svc.issue(issue(employee.id));
    expect(v1.version).toBe(1);
    expect(v1.organizationId).toBe(ORG);
    const v2 = await svc.issue(issue(employee.id));
    expect(v2.version).toBe(2);
    await expect(
      svc.issue(issue("00000000-0000-0000-0000-000000000000" as Uuid)),
    ).rejects.toBeInstanceOf(EmployeeNotFoundError);
  });

  it("supersedes the prior active contract on activation (single active per employee)", async () => {
    const { svc, employee, events } = await harness();
    const v1 = await svc.issue(issue(employee.id));
    await svc.activate(TENANT, v1.id);
    const v2 = await svc.issue(issue(employee.id));
    const activatedV2 = await svc.activate(TENANT, v2.id);

    expect(activatedV2.supersedesContractId).toBe(v1.id);
    const active = await svc.getActiveForEmployee(TENANT, employee.id);
    expect(active?.id).toBe(v2.id);
    expect((await svc.getById(TENANT, v1.id)).status).toBe("expired");
    expect(await svc.listForEmployee(TENANT, employee.id)).toHaveLength(2);

    // v1 issued+activated, then v1 ended (superseded) + v2 issued + v2 activated
    expect(events.map((e) => e.type)).toEqual([
      "workforce.contract.issued",
      "workforce.contract.activated",
      "workforce.contract.issued",
      "workforce.contract.ended",
      "workforce.contract.activated",
    ]);
  });

  it("freezes an active contract against edits", async () => {
    const { svc, employee } = await harness();
    const v1 = await svc.issue(issue(employee.id));
    await svc.setGrade(TENANT, v1.id, "PGT-III"); // draft edit ok
    await svc.activate(TENANT, v1.id);
    await expect(svc.setGrade(TENANT, v1.id, "PGT-IV")).rejects.toBeInstanceOf(
      ContractNotEditableError,
    );
  });

  it("rejects re-activating a superseded version without disturbing the active one", async () => {
    const { svc, employee, events } = await harness();
    const v1 = await svc.issue(issue(employee.id));
    await svc.activate(TENANT, v1.id);
    const v2 = await svc.issue(issue(employee.id));
    await svc.activate(TENANT, v2.id); // v1 now expired, v2 active
    const eventCount = events.length;

    // Re-activating v1 (now expired) must throw and leave v2 active — no side effects, no event.
    await expect(svc.activate(TENANT, v1.id)).rejects.toBeInstanceOf(
      InvalidContractTransitionError,
    );
    expect((await svc.getActiveForEmployee(TENANT, employee.id))?.id).toBe(v2.id);
    expect((await svc.getById(TENANT, v2.id)).status).toBe("active");
    expect((await svc.getById(TENANT, v1.id)).status).toBe("expired");
    expect(events).toHaveLength(eventCount); // no spurious contract.ended
  });
});
