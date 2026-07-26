import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { createBedAllocation } from "./bed-allocation";
import { registerHostel } from "./hostel";
import { HostelOccupancyProfileService } from "./hostel-occupancy-profile-service";
import {
  InMemoryBedAllocationRepository,
  InMemoryHostelOccupancyProfileRepository,
  InMemoryHostelRepository,
  InMemoryRoomRepository,
} from "./ports";
import { draftRoom, makeRoomAvailable } from "./room";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const studentA = "aaaaaaaa-0000-0000-0000-000000000001" as Uuid;

const setup = async () => {
  const repository = new InMemoryHostelOccupancyProfileRepository();
  const hostels = new InMemoryHostelRepository();
  const rooms = new InMemoryRoomRepository();
  const allocations = new InMemoryBedAllocationRepository();
  const hostel = registerHostel({
    tenantId,
    organizationId,
    code: "H1",
    name: "North",
    type: "boys",
  });
  await hostels.save(hostel);

  const room1 = makeRoomAvailable(
    draftRoom({
      tenantId,
      organizationId,
      hostelId: hostel.id,
      roomNumber: "101",
      type: "double",
      beds: [
        { key: "b1", label: "A" },
        { key: "b2", label: "B" },
      ],
    }),
  );
  const room2 = makeRoomAvailable(
    draftRoom({
      tenantId,
      organizationId,
      hostelId: hostel.id,
      roomNumber: "102",
      type: "single",
      beds: [{ key: "c1", label: "A" }],
    }),
  );
  await rooms.save(room1);
  await rooms.save(room2);
  await allocations.save(
    createBedAllocation({
      tenantId,
      organizationId,
      hostelId: hostel.id,
      roomId: room1.id,
      bedKey: "b1",
      studentId: studentA,
      effectiveFrom: "2026-07-01",
    }),
  );

  const service = new HostelOccupancyProfileService({ repository, hostels, rooms, allocations });
  return { repository, service, hostel, room1 };
};

describe("HostelOccupancyProfileService.refresh", () => {
  it("reconciles rooms and active allocations into a profile", async () => {
    const { service, hostel } = await setup();
    const profile = await service.refresh(tenantId, hostel.id);
    expect(profile.roomCount).toBe(2);
    expect(profile.bedCount).toBe(3);
    expect(profile.occupantCount).toBe(1);
    expect(profile.bedsAvailable).toBe(2);
    expect(profile.version).toBe(1);
    expect(profile.overCapacity).toBe(false);
  });

  it("version-bumps on a second refresh and rolls up to the institution summary", async () => {
    const { service, hostel } = await setup();
    await service.refresh(tenantId, hostel.id);
    const second = await service.refresh(tenantId, hostel.id);
    expect(second.version).toBe(2);
    const summary = await service.summarize(tenantId);
    expect(summary.hostelCount).toBe(1);
    expect(summary.bedCount).toBe(3);
    expect(summary.occupantCount).toBe(1);
  });

  it("rejects an unknown hostel", async () => {
    const { service } = await setup();
    await expect(service.refresh(tenantId, "missing" as Uuid)).rejects.toThrow(/Hostel/);
  });
});
