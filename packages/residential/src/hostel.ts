import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyHostelCodeError, EmptyHostelNameError, InvalidHostelTransitionError } from "./errors";
import type { HostelStatus, HostelType } from "./residential-value";

/**
 * A hostel — a residential building the institution operates for boarders, housing boys, girls or a
 * mixed population. It carries a code (unique within the tenant), a name, a type, and an optionally
 * assigned supervising warden. It runs `active ↔ under_maintenance` (temporarily off) and
 * `→ decommissioned` (a terminal end of service). Only an `active` hostel can take rooms and allocations.
 * The organization is the campus node the hostel belongs to.
 */
export interface Hostel {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly type: HostelType;
  readonly wardenId: Uuid | null;
  readonly status: HostelStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RegisterHostelParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly type: HostelType;
}

/** Register a hostel (status `active`). Code and name required. */
export function registerHostel(params: RegisterHostelParams): Hostel {
  const code = params.code.trim();
  if (code.length === 0) {
    throw new EmptyHostelCodeError();
  }
  const name = params.name.trim();
  if (name.length === 0) {
    throw new EmptyHostelNameError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    code,
    name,
    type: params.type,
    wardenId: null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (hostel: Hostel, patch: Partial<Hostel>): Hostel => ({
  ...hostel,
  ...patch,
  updatedAt: nowIso(),
});

/** Rename a hostel. */
export function renameHostel(hostel: Hostel, name: string): Hostel {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new EmptyHostelNameError();
  }
  return touch(hostel, { name: trimmed });
}

/** Assign a supervising warden to the hostel (the service validates the warden is active). */
export const assignHostelWarden = (hostel: Hostel, wardenId: Uuid): Hostel =>
  touch(hostel, { wardenId });

/** Clear the hostel's assigned warden. */
export const unassignHostelWarden = (hostel: Hostel): Hostel => touch(hostel, { wardenId: null });

/** Take an active hostel off service for maintenance (→ `under_maintenance`). */
export function sendHostelToMaintenance(hostel: Hostel): Hostel {
  if (hostel.status !== "active") {
    throw new InvalidHostelTransitionError(hostel.status, "under_maintenance");
  }
  return touch(hostel, { status: "under_maintenance" });
}

/** Return a hostel from maintenance to service (→ `active`). */
export function returnHostelFromMaintenance(hostel: Hostel): Hostel {
  if (hostel.status !== "under_maintenance") {
    throw new InvalidHostelTransitionError(hostel.status, "active");
  }
  return touch(hostel, { status: "active" });
}

/** Decommission a hostel (→ `decommissioned`, terminal). */
export function decommissionHostel(hostel: Hostel): Hostel {
  if (hostel.status === "decommissioned") {
    throw new InvalidHostelTransitionError(hostel.status, "decommissioned");
  }
  return touch(hostel, { status: "decommissioned" });
}

/** Whether the hostel is active and available to take rooms and allocations. */
export const isHostelActive = (hostel: Hostel): boolean => hostel.status === "active";
