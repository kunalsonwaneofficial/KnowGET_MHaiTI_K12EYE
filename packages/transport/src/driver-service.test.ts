import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { DriverService } from "./driver-service";
import {
  DuplicateDriverForEmployeeError,
  DuplicateLicenseNumberError,
  EmployeeNotFoundForTransportError,
} from "./errors";
import type { EmployeeDirectory } from "./ports";
import { InMemoryDriverRepository } from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const EMP = "33333333-3333-3333-3333-333333333333" as Uuid;
const EMP2 = "44444444-4444-4444-4444-444444444444" as Uuid;

const employees: EmployeeDirectory = {
  exists: async (_t, id) => id === EMP || id === EMP2,
  organizationOf: async (_t, id) => (id === EMP || id === EMP2 ? ORG : null),
};

function harness() {
  const events: DomainEvent[] = [];
  const svc = new DriverService({
    repository: new InMemoryDriverRepository(),
    employees,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

const input = {
  tenantId: TENANT,
  employeeId: EMP,
  licenseNumber: "DL-0099",
  licenseExpiry: "2027-03-31",
};

describe("DriverService", () => {
  it("registers a driver deriving the org from the employee, enforcing uniqueness", async () => {
    const { svc, events } = harness();
    const d = await svc.register(input);
    expect(d.organizationId).toBe(ORG);
    expect(events.map((e) => e.type)).toEqual(["transport.driver.registered"]);
    // same licence (different employee) → duplicate licence
    await expect(svc.register({ ...input, employeeId: EMP2 })).rejects.toBeInstanceOf(
      DuplicateLicenseNumberError,
    );
    // same employee (different licence) → duplicate driver for employee
    await expect(svc.register({ ...input, licenseNumber: "DL-0100" })).rejects.toBeInstanceOf(
      DuplicateDriverForEmployeeError,
    );
    // unknown employee → not found
    await expect(
      svc.register({ ...input, employeeId: "x" as Uuid, licenseNumber: "DL-0101" }),
    ).rejects.toBeInstanceOf(EmployeeNotFoundForTransportError);
  });

  it("drives the suspend/reinstate/deactivate lifecycle with events", async () => {
    const { svc, events } = harness();
    const d = await svc.register(input);
    await svc.suspend(TENANT, d.id);
    await svc.reinstate(TENANT, d.id);
    const gone = await svc.deactivate(TENANT, d.id);
    expect(gone.status).toBe("deactivated");
    expect(events.map((e) => e.type)).toEqual([
      "transport.driver.registered",
      "transport.driver.suspended",
      "transport.driver.reinstated",
      "transport.driver.deactivated",
    ]);
  });
});
