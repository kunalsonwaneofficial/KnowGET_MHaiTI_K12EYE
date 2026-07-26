import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { HostelService } from "./hostel-service";
import {
  InMemoryHostelRepository,
  InMemoryWardenRepository,
  type OrganizationDirectory,
} from "./ports";
import { registerWarden, relieveWarden } from "./warden";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const orgDir = (known = true): OrganizationDirectory => ({
  async exists() {
    return known;
  },
});

const setup = (known = true) => {
  const repository = new InMemoryHostelRepository();
  const wardens = new InMemoryWardenRepository();
  const service = new HostelService({ repository, wardens, organizations: orgDir(known) });
  return { repository, wardens, service };
};

const input = { tenantId, organizationId, code: "H1", name: "North Wing", type: "boys" as const };

describe("HostelService.create", () => {
  it("creates a hostel when the organization exists and the code is free", async () => {
    const { service } = setup();
    const hostel = await service.create(input);
    expect(hostel.status).toBe("active");
    expect(await service.getByCode(tenantId, "H1")).toMatchObject({ id: hostel.id });
  });

  it("rejects an unknown organization", async () => {
    const { service } = setup(false);
    await expect(service.create(input)).rejects.toThrow(/Organization/);
  });

  it("rejects a duplicate code within the tenant", async () => {
    const { service } = setup();
    await service.create(input);
    await expect(service.create(input)).rejects.toThrow(/already in use/);
  });
});

describe("HostelService.assignWarden", () => {
  it("assigns an active warden", async () => {
    const { service, wardens } = setup();
    const hostel = await service.create(input);
    const warden = registerWarden({
      tenantId,
      organizationId,
      employeeId: "e" as Uuid,
      role: "warden",
    });
    await wardens.save(warden);
    const updated = await service.assignWarden(tenantId, hostel.id, warden.id);
    expect(updated.wardenId).toBe(warden.id);
  });

  it("rejects assigning an unknown or relieved warden", async () => {
    const { service, wardens } = setup();
    const hostel = await service.create(input);
    await expect(service.assignWarden(tenantId, hostel.id, "missing" as Uuid)).rejects.toThrow(
      /not found/,
    );
    const relieved = relieveWarden(
      registerWarden({ tenantId, organizationId, employeeId: "e" as Uuid, role: "warden" }),
    );
    await wardens.save(relieved);
    await expect(service.assignWarden(tenantId, hostel.id, relieved.id)).rejects.toThrow(
      /not active/,
    );
  });
});

describe("HostelService lifecycle", () => {
  it("drives maintenance and decommission", async () => {
    const { service } = setup();
    const hostel = await service.create(input);
    expect((await service.sendToMaintenance(tenantId, hostel.id)).status).toBe("under_maintenance");
    expect((await service.returnFromMaintenance(tenantId, hostel.id)).status).toBe("active");
    expect((await service.decommission(tenantId, hostel.id)).status).toBe("decommissioned");
  });
});
