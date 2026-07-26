import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateBedKeyError,
  EmptyRoomError,
  EmptyRoomNumberError,
  InvalidRoomTransitionError,
  RoomNotEditableError,
  BedNotFoundError,
} from "./errors";
import { computeRoomOccupancy } from "./occupancy";
import { type Bed, type BedInput, buildBeds, makeBed } from "./room-bed";
import type { RoomStatus, RoomType } from "./residential-value";
import type { RoomOccupancy } from "./residential-view";

/**
 * A room in a {@link Hostel} — an ordered set of individually-allocatable beds on a floor. It carries a
 * room number (unique within its hostel), a type (single/double/triple/dormitory) and its bed list. It
 * runs `draft` (beds editable) → `available` (published, beds frozen, allocatable) ↔ `under_maintenance`
 * → `decommissioned`. The bed count is the room's capacity; its occupancy (active allocations against
 * beds) is derived by the pure engine, never stored. The organization is derived from the hostel.
 */
export interface Room {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly hostelId: Uuid;
  readonly roomNumber: string;
  readonly floor: number | null;
  readonly type: RoomType;
  readonly beds: readonly Bed[];
  readonly status: RoomStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface DraftRoomParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly hostelId: Uuid;
  readonly roomNumber: string;
  readonly type: RoomType;
  readonly floor?: number | null;
  readonly beds?: readonly BedInput[];
}

/** Draft a room (status `draft`). Room number required; beds may be supplied and edited while draft. */
export function draftRoom(params: DraftRoomParams): Room {
  const roomNumber = params.roomNumber.trim();
  if (roomNumber.length === 0) {
    throw new EmptyRoomNumberError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    hostelId: params.hostelId,
    roomNumber,
    floor: params.floor ?? null,
    type: params.type,
    beds: buildBeds(params.beds ?? []),
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (room: Room, patch: Partial<Room>): Room => ({
  ...room,
  ...patch,
  updatedAt: nowIso(),
});

const requireDraft = (room: Room): void => {
  if (room.status !== "draft") {
    throw new RoomNotEditableError(room.id, room.status);
  }
};

/** Set (or clear) the room's floor. */
export const setRoomFloor = (room: Room, floor: number | null): Room => touch(room, { floor });

/** Add a bed to a draft room (unique key). */
export function addBed(room: Room, input: BedInput): Room {
  requireDraft(room);
  const bed = makeBed(input);
  if (room.beds.some((b) => b.key === bed.key)) {
    throw new DuplicateBedKeyError(bed.key);
  }
  return touch(room, { beds: [...room.beds, bed] });
}

/** Remove a bed from a draft room. */
export function removeBed(room: Room, key: string): Room {
  requireDraft(room);
  if (!room.beds.some((b) => b.key === key)) {
    throw new BedNotFoundError(key);
  }
  return touch(room, { beds: room.beds.filter((b) => b.key !== key) });
}

/** Make a draft room available (→ `available`), freezing its beds. Requires at least one bed. */
export function makeRoomAvailable(room: Room): Room {
  if (room.status !== "draft") {
    throw new InvalidRoomTransitionError(room.status, "available");
  }
  if (room.beds.length === 0) {
    throw new EmptyRoomError();
  }
  return touch(room, { status: "available" });
}

/** Take an available room off for maintenance (→ `under_maintenance`). */
export function sendRoomToMaintenance(room: Room): Room {
  if (room.status !== "available") {
    throw new InvalidRoomTransitionError(room.status, "under_maintenance");
  }
  return touch(room, { status: "under_maintenance" });
}

/** Return a room from maintenance (→ `available`). */
export function returnRoomFromMaintenance(room: Room): Room {
  if (room.status !== "under_maintenance") {
    throw new InvalidRoomTransitionError(room.status, "available");
  }
  return touch(room, { status: "available" });
}

/** Decommission a room (→ `decommissioned`, terminal). */
export function decommissionRoom(room: Room): Room {
  if (room.status === "decommissioned") {
    throw new InvalidRoomTransitionError(room.status, "decommissioned");
  }
  return touch(room, { status: "decommissioned" });
}

/** Whether the room is available (can take bed allocations). */
export const isRoomAvailable = (room: Room): boolean => room.status === "available";

/** Whether the room has a bed with the given key. */
export const roomHasBed = (room: Room, key: string): boolean =>
  room.beds.some((b) => b.key === key);

/** The room's bed count (its capacity). */
export const bedCount = (room: Room): number => room.beds.length;

/** The room's occupancy given its active occupant count, via the pure engine. */
export const roomOccupancy = (room: Room, occupantCount: number): RoomOccupancy =>
  computeRoomOccupancy(room.beds.length, occupantCount);
