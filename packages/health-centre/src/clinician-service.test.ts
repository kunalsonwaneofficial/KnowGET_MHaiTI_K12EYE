import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { ClinicianService } from "./clinician-service";
import { InMemoryClinicianRepository, type EmployeeDirectory } from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const employeeId = "33333333-3333-3333-3333-333333333333" as Uuid;

const employeeDir = (org: Uuid | null = organizationId): EmployeeDirectory => ({
  async exists() {
    return org !== null;
  },
  async organizationOf() {
    return org;
  },
});

const setup = (org: Uuid | null = organizationId) => {
  const repository = new InMemoryClinicianRepository();
  const events: DomainEvent[] = [];
  const service = new ClinicianService({
    repository,
    employees: employeeDir(org),
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, service, events };
};

describe("ClinicianService", () => {
  it("registers a clinician deriving the org from the employee, and emits", async () => {
    const { service, events } = setup();
    const c = await service.register({ tenantId, employeeId, role: "physician" });
    expect(c.organizationId).toBe(organizationId);
    expect(c.status).toBe("active");
    expect(events.map((e) => e.type)).toContain("clinical.clinician.registered");
  });

  it("rejects an unknown employee and a duplicate for the same employee", async () => {
    const { service } = setup(null);
    await expect(service.register({ tenantId, employeeId, role: "nurse" })).rejects.toThrow(
      /Employee/,
    );
    const { service: s2 } = setup();
    await s2.register({ tenantId, employeeId, role: "nurse" });
    await expect(s2.register({ tenantId, employeeId, role: "physician" })).rejects.toThrow(
      /already registered/,
    );
  });

  it("edits role/registration and drives the suspend/reinstate/relieve lifecycle with events", async () => {
    const { service, events } = setup();
    const c = await service.register({ tenantId, employeeId, role: "physician" });
    await service.setRole(tenantId, c.id, "dentist");
    await service.setRegistration(tenantId, c.id, "MC-1");
    await service.suspend(tenantId, c.id);
    await service.reinstate(tenantId, c.id);
    await service.relieve(tenantId, c.id);
    const types = new Set(events.map((e) => e.type));
    expect(types.has("clinical.clinician.role_set")).toBe(true);
    expect(types.has("clinical.clinician.registration_set")).toBe(true);
    expect(types.has("clinical.clinician.suspended")).toBe(true);
    expect(types.has("clinical.clinician.reinstated")).toBe(true);
    expect(types.has("clinical.clinician.relieved")).toBe(true);
    expect((await service.getByEmployee(tenantId, employeeId))?.id).toBe(c.id);
  });
});
