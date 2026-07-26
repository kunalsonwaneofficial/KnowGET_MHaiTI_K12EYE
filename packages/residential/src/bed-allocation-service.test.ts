import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { BedAllocationService } from "./bed-allocation-service";
import {
  InMemoryBedAllocationRepository,
  InMemoryRoomRepository,
  type StudentDirectory,
} from "./ports";
import { draftRoom, makeRoomAvailable, sendRoomToMaintenance, type Room } from "./room";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const hostelId = "33333333-3333-3333-3333-333333333333" as Uuid;
const studentA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as Uuid;
const studentB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" as Uuid;

const students = (known: Uuid[]): StudentDirectory => ({
  async exists(_t, id) {
    return known.includes(id);
  },
  async organizationOf() {
    return organizationId;
  },
});

const availableRoom = (): Room =>
  makeRoomAvailable(
    draftRoom({
      tenantId,
      organizationId,
      hostelId,
      roomNumber: "101",
      type: "double",
      beds: [
        { key: "b1", label: "A" },
        { key: "b2", label: "B" },
      ],
    }),
  );

const setup = async (known: Uuid[] = [studentA, studentB]) => {
  const rooms = new InMemoryRoomRepository();
  const repository = new InMemoryBedAllocationRepository();
  const service = new BedAllocationService({ repository, rooms, students: students(known) });
  const room = availableRoom();
  await rooms.save(room);
  return { rooms, repository, service, room };
};

describe("BedAllocationService.create", () => {
  it("allocates a bed to a student under an available room", async () => {
    const { service, room } = await setup();
    const allocation = await service.create({
      tenantId,
      roomId: room.id,
      bedKey: "b1",
      studentId: studentA,
      effectiveFrom: "2026-07-01",
    });
    expect(allocation.status).toBe("active");
    expect(allocation.organizationId).toBe(organizationId);
    expect(allocation.hostelId).toBe(hostelId);
  });

  it("rejects an unknown student, unknown bed, or unavailable room", async () => {
    const { service, rooms, room } = await setup([]);
    await expect(
      service.create({
        tenantId,
        roomId: room.id,
        bedKey: "b1",
        studentId: studentA,
        effectiveFrom: "d",
      }),
    ).rejects.toThrow(/Student/);
    const knownStudents = await setup();
    await expect(
      knownStudents.service.create({
        tenantId,
        roomId: knownStudents.room.id,
        bedKey: "nope",
        studentId: studentA,
        effectiveFrom: "d",
      }),
    ).rejects.toThrow(/not found/);
    await rooms.save(sendRoomToMaintenance(room));
  });

  it("enforces one active allocation per bed", async () => {
    const { service, room } = await setup();
    await service.create({
      tenantId,
      roomId: room.id,
      bedKey: "b1",
      studentId: studentA,
      effectiveFrom: "d",
    });
    await expect(
      service.create({
        tenantId,
        roomId: room.id,
        bedKey: "b1",
        studentId: studentB,
        effectiveFrom: "d",
      }),
    ).rejects.toThrow(/already occupied/);
  });

  it("enforces one active allocation per student", async () => {
    const { service, room } = await setup();
    await service.create({
      tenantId,
      roomId: room.id,
      bedKey: "b1",
      studentId: studentA,
      effectiveFrom: "d",
    });
    await expect(
      service.create({
        tenantId,
        roomId: room.id,
        bedKey: "b2",
        studentId: studentA,
        effectiveFrom: "d",
      }),
    ).rejects.toThrow(/already has an active/);
  });

  it("frees the bed and the student once the allocation ends", async () => {
    const { service, room } = await setup();
    const first = await service.create({
      tenantId,
      roomId: room.id,
      bedKey: "b1",
      studentId: studentA,
      effectiveFrom: "d",
    });
    await service.end(tenantId, first.id, "2026-12-31");
    // bed b1 and student A are free again
    const reallocated = await service.create({
      tenantId,
      roomId: room.id,
      bedKey: "b1",
      studentId: studentA,
      effectiveFrom: "2027-01-01",
    });
    expect(reallocated.status).toBe("active");
  });
});
