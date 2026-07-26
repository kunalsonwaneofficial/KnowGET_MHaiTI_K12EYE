import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  addBed,
  bedCount,
  decommissionRoom,
  draftRoom,
  isRoomAvailable,
  makeRoomAvailable,
  removeBed,
  roomHasBed,
  roomOccupancy,
  sendRoomToMaintenance,
} from "./room";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const hostelId = "33333333-3333-3333-3333-333333333333" as Uuid;

const draft = (beds = [{ key: "b1", label: "A" }]) =>
  draftRoom({ tenantId, organizationId, hostelId, roomNumber: " 101 ", type: "double", beds });

describe("draftRoom", () => {
  it("drafts a room with trimmed number and built beds", () => {
    const room = draft([
      { key: "b1", label: "A" },
      { key: "b2", label: "B" },
    ]);
    expect(room.roomNumber).toBe("101");
    expect(room.status).toBe("draft");
    expect(bedCount(room)).toBe(2);
    expect(roomHasBed(room, "b2")).toBe(true);
  });

  it("rejects a blank room number and duplicate bed keys", () => {
    expect(() =>
      draftRoom({ tenantId, organizationId, hostelId, roomNumber: "  ", type: "single", beds: [] }),
    ).toThrow();
    expect(() =>
      draft([
        { key: "b1", label: "A" },
        { key: "b1", label: "B" },
      ]),
    ).toThrow(/already in use/);
  });
});

describe("room bed editing", () => {
  it("adds and removes beds only while draft", () => {
    const withTwo = addBed(draft(), { key: "b2", label: "B" });
    expect(bedCount(withTwo)).toBe(2);
    expect(bedCount(removeBed(withTwo, "b2"))).toBe(1);
    const available = makeRoomAvailable(draft());
    expect(() => addBed(available, { key: "b3", label: "C" })).toThrow(
      /only be edited while draft/,
    );
  });

  it("rejects a duplicate bed key and an unknown bed removal", () => {
    expect(() => addBed(draft(), { key: "b1", label: "dup" })).toThrow(/already in use/);
    expect(() => removeBed(draft(), "missing")).toThrow(/not found/);
  });
});

describe("room lifecycle", () => {
  it("requires a bed to become available, then freezes and cycles maintenance", () => {
    const empty = draftRoom({
      tenantId,
      organizationId,
      hostelId,
      roomNumber: "200",
      type: "single",
      beds: [],
    });
    expect(() => makeRoomAvailable(empty)).toThrow(/at least one bed/);
    const available = makeRoomAvailable(draft());
    expect(isRoomAvailable(available)).toBe(true);
    expect(sendRoomToMaintenance(available).status).toBe("under_maintenance");
    expect(decommissionRoom(available).status).toBe("decommissioned");
  });
});

describe("roomOccupancy", () => {
  it("derives occupancy from the bed count and active occupants", () => {
    const room = makeRoomAvailable(
      draft([
        { key: "b1", label: "A" },
        { key: "b2", label: "B" },
      ]),
    );
    expect(roomOccupancy(room, 1)).toMatchObject({ bedsAvailable: 1, occupancyPercent: 50 });
    expect(roomOccupancy(room, 3).overCapacity).toBe(true);
  });
});
