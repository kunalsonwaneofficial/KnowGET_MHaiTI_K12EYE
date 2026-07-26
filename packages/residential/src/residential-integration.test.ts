import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { BedAllocationService } from "./bed-allocation-service";
import { HostelInspectionService } from "./hostel-inspection-service";
import { HostelOccupancyProfileService } from "./hostel-occupancy-profile-service";
import { HostelService } from "./hostel-service";
import { OutpassService } from "./outpass-service";
import {
  InMemoryBedAllocationRepository,
  InMemoryHostelInspectionRepository,
  InMemoryHostelOccupancyProfileRepository,
  InMemoryHostelRepository,
  InMemoryOutpassRepository,
  InMemoryRollCallRepository,
  InMemoryRoomRepository,
  InMemoryWardenRepository,
  type EmployeeDirectory,
  type OrganizationDirectory,
  type StudentDirectory,
} from "./ports";
import { RollCallService } from "./roll-call-service";
import { RoomService } from "./room-service";
import { WardenService } from "./warden-service";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const employeeId = "ee000000-0000-0000-0000-000000000001" as Uuid;
const studentA = "aa000000-0000-0000-0000-000000000001" as Uuid;
const studentB = "aa000000-0000-0000-0000-000000000002" as Uuid;

const orgDir: OrganizationDirectory = {
  async exists() {
    return true;
  },
};
const employeeDir: EmployeeDirectory = {
  async exists() {
    return true;
  },
  async organizationOf() {
    return organizationId;
  },
};
const studentDir: StudentDirectory = {
  async exists() {
    return true;
  },
  async organizationOf() {
    return organizationId;
  },
};

describe("residential end-to-end spine", () => {
  it("runs hostel → warden → room → allocation → occupancy → outpass → roll call → inspection", async () => {
    const events: DomainEvent[] = [];
    const bus = {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    };

    const hostelRepo = new InMemoryHostelRepository();
    const wardenRepo = new InMemoryWardenRepository();
    const roomRepo = new InMemoryRoomRepository();
    const allocationRepo = new InMemoryBedAllocationRepository();
    const outpassRepo = new InMemoryOutpassRepository();
    const rollCallRepo = new InMemoryRollCallRepository();
    const inspectionRepo = new InMemoryHostelInspectionRepository();
    const profileRepo = new InMemoryHostelOccupancyProfileRepository();

    const hostels = new HostelService({
      repository: hostelRepo,
      organizations: orgDir,
      wardens: wardenRepo,
      events: bus,
    });
    const wardens = new WardenService({
      repository: wardenRepo,
      employees: employeeDir,
      events: bus,
    });
    const rooms = new RoomService({ repository: roomRepo, hostels: hostelRepo, events: bus });
    const allocations = new BedAllocationService({
      repository: allocationRepo,
      rooms: roomRepo,
      students: studentDir,
      events: bus,
    });
    const outpasses = new OutpassService({
      repository: outpassRepo,
      allocations: allocationRepo,
      wardens: wardenRepo,
      events: bus,
    });
    const rollCalls = new RollCallService({
      repository: rollCallRepo,
      hostels: hostelRepo,
      allocations: allocationRepo,
      events: bus,
    });
    const inspections = new HostelInspectionService({
      repository: inspectionRepo,
      hostels: hostelRepo,
      events: bus,
    });
    const occupancy = new HostelOccupancyProfileService({
      repository: profileRepo,
      hostels: hostelRepo,
      rooms: roomRepo,
      allocations: allocationRepo,
      events: bus,
    });

    // 1. Hostel + warden, and assign the warden.
    const hostel = await hostels.create({
      tenantId,
      organizationId,
      code: "BH1",
      name: "Boys Hostel 1",
      type: "boys",
    });
    const warden = await wardens.register({ tenantId, employeeId, role: "chief_warden" });
    const withWarden = await hostels.assignWarden(tenantId, hostel.id, warden.id);
    expect(withWarden.wardenId).toBe(warden.id);

    // 2. Room with two beds, made available.
    let room = await rooms.create({
      tenantId,
      hostelId: hostel.id,
      roomNumber: "101",
      type: "double",
      beds: [
        { key: "b1", label: "A" },
        { key: "b2", label: "B" },
      ],
    });
    room = await rooms.makeAvailable(tenantId, room.id);

    // 3. Allocate two students.
    await allocations.create({
      tenantId,
      roomId: room.id,
      bedKey: "b1",
      studentId: studentA,
      effectiveFrom: "2026-07-01",
    });
    await allocations.create({
      tenantId,
      roomId: room.id,
      bedKey: "b2",
      studentId: studentB,
      effectiveFrom: "2026-07-01",
    });

    // 4. Occupancy profile reflects a full room.
    const profile = await occupancy.refresh(tenantId, hostel.id);
    expect(profile.bedCount).toBe(2);
    expect(profile.occupantCount).toBe(2);
    expect(profile.bedsAvailable).toBe(0);

    // 5. Outpass for student A: request → approve → check out → return.
    const outpass = await outpasses.request({
      tenantId,
      studentId: studentA,
      type: "home",
      expectedOutAt: "2026-08-01T08:00:00Z",
      expectedInAt: "2026-08-03T20:00:00Z",
    });
    await outpasses.approve(tenantId, outpass.id, warden.id);
    await outpasses.checkOut(tenantId, outpass.id, "2026-08-01T08:10:00Z");
    const returned = await outpasses.return(tenantId, outpass.id, "2026-08-03T19:00:00Z");
    expect(returned.status).toBe("returned");

    // 6. Curfew roll call: roster is the two residents; mark and complete.
    const rollCall = await rollCalls.schedule({
      tenantId,
      hostelId: hostel.id,
      scheduledFor: "2026-08-01T21:00:00Z",
    });
    expect(rollCall.expectedResidentIds).toHaveLength(2);
    await rollCalls.start(tenantId, rollCall.id);
    await rollCalls.mark(tenantId, rollCall.id, {
      residentId: studentA,
      mark: "on_leave",
      notedAt: "t",
    });
    await rollCalls.mark(tenantId, rollCall.id, {
      residentId: studentB,
      mark: "present",
      notedAt: "t",
    });
    const summary = await rollCalls.summaryFor(tenantId, rollCall.id);
    expect(summary.allAccountedFor).toBe(true);
    expect(summary.unaccountedForCount).toBe(0);
    await rollCalls.complete(tenantId, rollCall.id);

    // 7. Inspection + compliance.
    const inspection = await inspections.record({
      tenantId,
      hostelId: hostel.id,
      type: "fire_safety",
      conductedOn: "2026-01-01",
      outcome: "compliant",
      nextDueOn: "2026-12-31",
    });
    expect((await inspections.complianceFor(tenantId, inspection.id, "2026-06-01")).status).toBe(
      "valid",
    );

    // 8. The whole spine published domain events.
    const types = new Set(events.map((e) => e.type));
    expect(types.has("residential.hostel.registered")).toBe(true);
    expect(types.has("residential.warden.registered")).toBe(true);
    expect(types.has("residential.allocation.created")).toBe(true);
    expect(types.has("residential.occupancy.refreshed")).toBe(true);
    expect(types.has("residential.outpass.returned")).toBe(true);
    expect(types.has("residential.roll_call.completed")).toBe(true);
    expect(types.has("residential.inspection.recorded")).toBe(true);
  });
});
