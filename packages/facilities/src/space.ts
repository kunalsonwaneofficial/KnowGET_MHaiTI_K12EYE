import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptySpaceCodeError, InvalidCapacityError, InvalidSpaceTransitionError } from "./errors";
import type { SpaceStatus, SpaceType } from "./facilities-value";

/**
 * A space — a room or area within a building (a classroom, laboratory, office, hall, storage, restroom or
 * common area). It carries a code (unique within its building), a type, a floor and a usable capacity. It
 * runs `draft → available ↔ out_of_service → decommissioned`. **The floor is fixed once the space enters
 * service** (a structural fact), while the capacity can be reconfigured. An `available` space and its
 * capacity are what the pure condition engine reads. The organization and building are the campus context.
 */
export interface Space {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly buildingId: Uuid;
  readonly code: string;
  readonly type: SpaceType;
  readonly floor: number;
  readonly capacity: number;
  readonly status: SpaceStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateSpaceParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly buildingId: Uuid;
  readonly code: string;
  readonly type: SpaceType;
  readonly floor: number;
  readonly capacity?: number;
}

function requireNonNegativeInt(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new InvalidCapacityError(value);
  }
  return value;
}

/** Create a space (status `draft`). Code required; floor and capacity non-negative integers. */
export function createSpace(params: CreateSpaceParams): Space {
  const code = params.code.trim();
  if (code.length === 0) {
    throw new EmptySpaceCodeError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    buildingId: params.buildingId,
    code,
    type: params.type,
    floor: requireNonNegativeInt(params.floor),
    capacity: requireNonNegativeInt(params.capacity ?? 0),
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (space: Space, patch: Partial<Space>): Space => ({
  ...space,
  ...patch,
  updatedAt: nowIso(),
});

/** Set the space's type. */
export const setSpaceType = (space: Space, type: SpaceType): Space => touch(space, { type });

/** Set the usable capacity (a non-negative integer); allowed at any point before decommissioning. */
export function setSpaceCapacity(space: Space, capacity: number): Space {
  if (space.status === "decommissioned") {
    throw new InvalidSpaceTransitionError(space.status, "capacity-set");
  }
  return touch(space, { capacity: requireNonNegativeInt(capacity) });
}

/** Set the floor — a structural fact, editable only while the space is `draft`. */
export function setSpaceFloor(space: Space, floor: number): Space {
  if (space.status !== "draft") {
    throw new InvalidSpaceTransitionError(space.status, "floor-set");
  }
  return touch(space, { floor: requireNonNegativeInt(floor) });
}

/** Bring a drafted space into service (→ `available`). */
export function makeSpaceAvailable(space: Space): Space {
  if (space.status !== "draft") {
    throw new InvalidSpaceTransitionError(space.status, "available");
  }
  return touch(space, { status: "available" });
}

/** Take an available space out of service (→ `out_of_service`). */
export function takeSpaceOutOfService(space: Space): Space {
  if (space.status !== "available") {
    throw new InvalidSpaceTransitionError(space.status, "out_of_service");
  }
  return touch(space, { status: "out_of_service" });
}

/** Return a space from out-of-service to service (→ `available`). */
export function returnSpaceToService(space: Space): Space {
  if (space.status !== "out_of_service") {
    throw new InvalidSpaceTransitionError(space.status, "available");
  }
  return touch(space, { status: "available" });
}

/** Decommission a space (→ `decommissioned`, terminal). */
export function decommissionSpace(space: Space): Space {
  if (space.status === "decommissioned") {
    throw new InvalidSpaceTransitionError(space.status, "decommissioned");
  }
  return touch(space, { status: "decommissioned" });
}

/** Whether the space is available for use. */
export const isSpaceAvailable = (space: Space): boolean => space.status === "available";
