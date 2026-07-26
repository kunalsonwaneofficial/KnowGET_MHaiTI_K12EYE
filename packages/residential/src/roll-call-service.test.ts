import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { createBedAllocation } from "./bed-allocation";
import { registerHostel, sendHostelToMaintenance } from "./hostel";
import {
  InMemoryBedAllocationRepository,
  InMemoryHostelRepository,
  InMemoryRollCallRepository,
} from "./ports";
import { RollCallService } from "./roll-call-service";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const roomId = "44444444-4444-4444-4444-444444444444" as Uuid;
const s1 = "aaaaaaaa-0000-0000-0000-000000000001" as Uuid;
const s2 = "aaaaaaaa-0000-0000-0000-000000000002" as Uuid;

const setup = async (activeHostel = true) => {
  const repository = new InMemoryRollCallRepository();
  const hostels = new InMemoryHostelRepository();
  const allocations = new InMemoryBedAllocationRepository();
  let hostel = registerHostel({
    tenantId,
    organizationId,
    code: "H1",
    name: "North",
    type: "boys",
  });
  if (!activeHostel) {
    hostel = sendHostelToMaintenance(hostel);
  }
  await hostels.save(hostel);
  for (const studentId of [s1, s2]) {
    await allocations.save(
      createBedAllocation({
        tenantId,
        organizationId,
        hostelId: hostel.id,
        roomId,
        bedKey: `bed-${studentId}`,
        studentId,
        effectiveFrom: "2026-07-01",
      }),
    );
  }
  const service = new RollCallService({ repository, hostels, allocations });
  return { repository, hostels, allocations, service, hostel };
};

describe("RollCallService.schedule", () => {
  it("captures the roster from the hostel's active allocations", async () => {
    const { service, hostel } = await setup();
    const rc = await service.schedule({
      tenantId,
      hostelId: hostel.id,
      scheduledFor: "2026-07-01T21:00:00Z",
    });
    expect(rc.expectedResidentIds).toHaveLength(2);
    expect([...rc.expectedResidentIds].sort()).toEqual([s1, s2].sort());
  });

  it("rejects an unknown or inactive hostel", async () => {
    const { service, hostel } = await setup(false);
    await expect(
      service.schedule({ tenantId, hostelId: hostel.id, scheduledFor: "t" }),
    ).rejects.toThrow(/not active/);
    await expect(
      service.schedule({ tenantId, hostelId: "missing" as Uuid, scheduledFor: "t" }),
    ).rejects.toThrow(/Hostel/);
  });
});

describe("RollCallService flow", () => {
  it("starts, marks residents, and completes with the summary", async () => {
    const { service, hostel } = await setup();
    const rc = await service.schedule({ tenantId, hostelId: hostel.id, scheduledFor: "t" });
    await service.start(tenantId, rc.id);
    await service.mark(tenantId, rc.id, { residentId: s1, mark: "present", notedAt: "t" });
    await service.mark(tenantId, rc.id, { residentId: s2, mark: "absent", notedAt: "t" });
    const summary = await service.summaryFor(tenantId, rc.id);
    expect(summary.presentCount).toBe(1);
    expect(summary.unaccountedForCount).toBe(1);
    expect((await service.complete(tenantId, rc.id)).status).toBe("completed");
  });
});
