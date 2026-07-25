import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { type Employee, onboardEmployee } from "./employee";
import { DuplicateEntitlementError, EmployeeNotFoundError } from "./errors";
import { LeaveService } from "./leave-service";
import {
  InMemoryEmployeeRepository,
  InMemoryLeaveEntitlementRepository,
  InMemoryLeaveRequestRepository,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const PERSON = "33333333-3333-3333-3333-333333333333" as Uuid;

async function harness(): Promise<{
  svc: LeaveService;
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
  const svc = new LeaveService({
    entitlements: new InMemoryLeaveEntitlementRepository(),
    requests: new InMemoryLeaveRequestRepository(),
    employees,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, employee, events };
}

describe("LeaveService", () => {
  it("grants entitlements (one per type per period) and rejects an unknown employee", async () => {
    const { svc, employee } = await harness();
    await svc.grant({
      tenantId: TENANT,
      employeeId: employee.id,
      leaveType: "annual",
      period: "2026",
      entitledDays: 20,
    });
    await expect(
      svc.grant({
        tenantId: TENANT,
        employeeId: employee.id,
        leaveType: "annual",
        period: "2026",
        entitledDays: 15,
      }),
    ).rejects.toBeInstanceOf(DuplicateEntitlementError);
    await expect(
      svc.grant({
        tenantId: TENANT,
        employeeId: "00000000-0000-0000-0000-000000000000" as Uuid,
        leaveType: "sick",
        period: "2026",
        entitledDays: 10,
      }),
    ).rejects.toBeInstanceOf(EmployeeNotFoundError);
  });

  it("reconciles entitlements and requests into a ledger via the pure engine", async () => {
    const { svc, employee, events } = await harness();
    await svc.grant({
      tenantId: TENANT,
      employeeId: employee.id,
      leaveType: "annual",
      period: "2026",
      entitledDays: 20,
    });

    const taken = await svc.request({
      tenantId: TENANT,
      employeeId: employee.id,
      leaveType: "annual",
      days: 5,
      startDate: "2026-03-01",
    });
    await svc.approve(TENANT, taken.id);

    await svc.request({
      tenantId: TENANT,
      employeeId: employee.id,
      leaveType: "annual",
      days: 3,
      startDate: "2026-07-01",
    }); // stays pending

    const rejected = await svc.request({
      tenantId: TENANT,
      employeeId: employee.id,
      leaveType: "annual",
      days: 10,
      startDate: "2026-09-01",
    });
    await svc.reject(TENANT, rejected.id); // ignored by the ledger

    const ledger = await svc.computeLedger(TENANT, employee.id, "2026");
    const annual = ledger.lines.find((l) => l.leaveType === "annual");
    expect(annual).toEqual({
      leaveType: "annual",
      entitled: 20,
      taken: 5,
      pending: 3,
      remaining: 15,
    });
    expect(ledger.utilizationRate).toBe(25); // 100 * 5 / 20

    expect(events.map((e) => e.type)).toEqual([
      "workforce.leave.requested",
      "workforce.leave.approved",
      "workforce.leave.requested",
      "workforce.leave.requested",
      "workforce.leave.rejected",
    ]);
  });

  it("scopes the ledger to the requested period", async () => {
    const { svc, employee } = await harness();
    await svc.grant({
      tenantId: TENANT,
      employeeId: employee.id,
      leaveType: "annual",
      period: "2027",
      entitledDays: 25,
    });
    const ledger2026 = await svc.computeLedger(TENANT, employee.id, "2026");
    expect(ledger2026.totalEntitled).toBe(0); // the 2027 grant is out of scope
    const ledger2027 = await svc.computeLedger(TENANT, employee.id, "2027");
    expect(ledger2027.totalEntitled).toBe(25);
  });
});
