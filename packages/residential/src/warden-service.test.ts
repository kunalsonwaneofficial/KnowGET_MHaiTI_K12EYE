import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { InMemoryWardenRepository, type EmployeeDirectory } from "./ports";
import { WardenService } from "./warden-service";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const employeeId = "44444444-4444-4444-4444-444444444444" as Uuid;

const employeeDir = (org: Uuid | null): EmployeeDirectory => ({
  async exists() {
    return org !== null;
  },
  async organizationOf() {
    return org;
  },
});

const setup = (org: Uuid | null = organizationId) => {
  const repository = new InMemoryWardenRepository();
  const service = new WardenService({ repository, employees: employeeDir(org) });
  return { repository, service };
};

describe("WardenService.register", () => {
  it("registers a warden deriving the organization from the employee", async () => {
    const { service } = setup();
    const warden = await service.register({ tenantId, employeeId, role: "warden" });
    expect(warden.organizationId).toBe(organizationId);
    expect(warden.status).toBe("active");
  });

  it("rejects an unknown employee", async () => {
    const { service } = setup(null);
    await expect(service.register({ tenantId, employeeId, role: "warden" })).rejects.toThrow(
      /Employee/,
    );
  });

  it("rejects a second warden for the same employee", async () => {
    const { service } = setup();
    await service.register({ tenantId, employeeId, role: "warden" });
    await expect(
      service.register({ tenantId, employeeId, role: "assistant_warden" }),
    ).rejects.toThrow(/already registered/);
  });
});

describe("WardenService lifecycle", () => {
  it("drives suspend, reinstate, relieve and role changes", async () => {
    const { service } = setup();
    const warden = await service.register({ tenantId, employeeId, role: "warden" });
    expect((await service.setRole(tenantId, warden.id, "chief_warden")).role).toBe("chief_warden");
    expect((await service.suspend(tenantId, warden.id)).status).toBe("suspended");
    expect((await service.reinstate(tenantId, warden.id)).status).toBe("active");
    expect((await service.relieve(tenantId, warden.id)).status).toBe("relieved");
  });
});
