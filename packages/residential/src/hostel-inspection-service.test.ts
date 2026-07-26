import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { registerHostel } from "./hostel";
import { HostelInspectionService } from "./hostel-inspection-service";
import { InMemoryHostelInspectionRepository, InMemoryHostelRepository } from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const setup = async () => {
  const repository = new InMemoryHostelInspectionRepository();
  const hostels = new InMemoryHostelRepository();
  const hostel = registerHostel({
    tenantId,
    organizationId,
    code: "H1",
    name: "North",
    type: "boys",
  });
  await hostels.save(hostel);
  const service = new HostelInspectionService({ repository, hostels });
  return { repository, hostels, service, hostel };
};

const input = (hostelId: Uuid) => ({
  tenantId,
  hostelId,
  type: "fire_safety" as const,
  conductedOn: "2026-01-01",
  outcome: "compliant" as const,
  nextDueOn: "2026-12-31",
});

describe("HostelInspectionService", () => {
  it("records an inspection deriving the org from the hostel", async () => {
    const { service, hostel } = await setup();
    const inspection = await service.record(input(hostel.id));
    expect(inspection.organizationId).toBe(organizationId);
  });

  it("rejects an unknown hostel and a duplicate inspection type", async () => {
    const { service, hostel } = await setup();
    await expect(service.record(input("missing" as Uuid))).rejects.toThrow(/Hostel/);
    await service.record(input(hostel.id));
    await expect(service.record(input(hostel.id))).rejects.toThrow(/already has/);
  });

  it("re-inspects in place and derives compliance", async () => {
    const { service, hostel } = await setup();
    const inspection = await service.record(input(hostel.id));
    const again = await service.reinspect(
      tenantId,
      inspection.id,
      "2027-01-01",
      "action_required",
      "2027-12-31",
    );
    expect(again.outcome).toBe("action_required");
    expect((await service.complianceFor(tenantId, inspection.id, "2027-06-01")).status).toBe(
      "valid",
    );
  });
});
