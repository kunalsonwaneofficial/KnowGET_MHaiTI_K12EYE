import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { registerHostel, sendHostelToMaintenance } from "./hostel";
import { InMemoryHostelRepository, InMemoryRoomRepository } from "./ports";
import { RoomService } from "./room-service";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const setup = async () => {
  const hostels = new InMemoryHostelRepository();
  const repository = new InMemoryRoomRepository();
  const service = new RoomService({ repository, hostels });
  const hostel = registerHostel({
    tenantId,
    organizationId,
    code: "H1",
    name: "North",
    type: "boys",
  });
  await hostels.save(hostel);
  return { hostels, repository, service, hostel };
};

const roomInput = (hostelId: Uuid) => ({
  tenantId,
  hostelId,
  roomNumber: "101",
  type: "double" as const,
  beds: [{ key: "b1", label: "A" }],
});

describe("RoomService.create", () => {
  it("drafts a room under an active hostel, deriving the org", async () => {
    const { service, hostel } = await setup();
    const room = await service.create(roomInput(hostel.id));
    expect(room.organizationId).toBe(organizationId);
    expect(room.status).toBe("draft");
  });

  it("rejects an unknown or inactive hostel", async () => {
    const { service, hostels, hostel } = await setup();
    await expect(service.create(roomInput("missing" as Uuid))).rejects.toThrow(/Hostel/);
    await hostels.save(sendHostelToMaintenance(hostel));
    await expect(service.create(roomInput(hostel.id))).rejects.toThrow(/not active/);
  });

  it("rejects a duplicate room number within the hostel", async () => {
    const { service, hostel } = await setup();
    await service.create(roomInput(hostel.id));
    await expect(service.create(roomInput(hostel.id))).rejects.toThrow(/already in use/);
  });
});

describe("RoomService lifecycle", () => {
  it("edits beds while draft then makes available", async () => {
    const { service, hostel } = await setup();
    const room = await service.create(roomInput(hostel.id));
    const withTwo = await service.addBed(tenantId, room.id, { key: "b2", label: "B" });
    expect(withTwo.beds).toHaveLength(2);
    const available = await service.makeAvailable(tenantId, room.id);
    expect(available.status).toBe("available");
    await expect(service.addBed(tenantId, room.id, { key: "b3", label: "C" })).rejects.toThrow(
      /only be edited while draft/,
    );
  });
});
