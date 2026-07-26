import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyBuildingCodeError,
  EmptyBuildingNameError,
  InvalidBuildingTransitionError,
  InvalidFloorsError,
} from "./errors";
import type { BuildingStatus, BuildingType } from "./facilities-value";

/**
 * A building — a structure on the campus (academic, administrative, laboratory, sports, library, utility or
 * multipurpose). It carries a code (unique within the tenant), a name, a type and a floor count. It runs
 * `active ↔ under_renovation` (temporarily off) and `→ decommissioned` (a terminal end of service); only an
 * `active` building takes spaces, systems and sensors. The organization is the campus node it belongs to.
 * The building's capital value and depreciation, if tracked, are the Asset register's (P2-D15) — never
 * here.
 */
export interface Building {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly type: BuildingType;
  readonly floors: number;
  readonly status: BuildingStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RegisterBuildingParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly type: BuildingType;
  readonly floors?: number;
}

function requireFloors(floors: number): number {
  if (!Number.isInteger(floors) || floors < 0) {
    throw new InvalidFloorsError(floors);
  }
  return floors;
}

/** Register a building (status `active`). Code and name required; floors a non-negative integer. */
export function registerBuilding(params: RegisterBuildingParams): Building {
  const code = params.code.trim();
  if (code.length === 0) {
    throw new EmptyBuildingCodeError();
  }
  const name = params.name.trim();
  if (name.length === 0) {
    throw new EmptyBuildingNameError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    code,
    name,
    type: params.type,
    floors: requireFloors(params.floors ?? 0),
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (building: Building, patch: Partial<Building>): Building => ({
  ...building,
  ...patch,
  updatedAt: nowIso(),
});

/** Rename a building. */
export function renameBuilding(building: Building, name: string): Building {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new EmptyBuildingNameError();
  }
  return touch(building, { name: trimmed });
}

/** Set the building's floor count (a non-negative integer). */
export function setBuildingFloors(building: Building, floors: number): Building {
  return touch(building, { floors: requireFloors(floors) });
}

/** Take an active building into renovation (→ `under_renovation`). */
export function startBuildingRenovation(building: Building): Building {
  if (building.status !== "active") {
    throw new InvalidBuildingTransitionError(building.status, "under_renovation");
  }
  return touch(building, { status: "under_renovation" });
}

/** Return a building from renovation to service (→ `active`). */
export function completeBuildingRenovation(building: Building): Building {
  if (building.status !== "under_renovation") {
    throw new InvalidBuildingTransitionError(building.status, "active");
  }
  return touch(building, { status: "active" });
}

/** Decommission a building (→ `decommissioned`, terminal). */
export function decommissionBuilding(building: Building): Building {
  if (building.status === "decommissioned") {
    throw new InvalidBuildingTransitionError(building.status, "decommissioned");
  }
  return touch(building, { status: "decommissioned" });
}

/** Whether the building is active and available to take spaces, systems and sensors. */
export const isBuildingActive = (building: Building): boolean => building.status === "active";
