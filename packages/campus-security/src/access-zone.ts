import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyZoneCodeError,
  EmptyZoneNameError,
  InvalidZoneCapacityError,
  InvalidZoneTransitionError,
} from "./errors";
import type { SecurityLevel, ZoneStatus } from "./campus-security-value";

/**
 * An access zone — a controlled area on the campus (a building, a floor, a lab, a server room, a gate line)
 * with a security level (public / restricted / secure / high_security) and an optional safe-occupancy
 * capacity. It runs `active ↔ locked_down` (a temporary emergency freeze) and `→ decommissioned` (a
 * terminal end of service); only a non-decommissioned zone admits visits, credentials and access events, and
 * the access engine denies a locked-down or decommissioned zone. Zones are a security abstraction scoped to
 * an organization — they may map to facilities buildings (P2-D20) but are modelled here independently.
 */
export interface AccessZone {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly securityLevel: SecurityLevel;
  readonly capacity: number;
  readonly status: ZoneStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateAccessZoneParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly securityLevel: SecurityLevel;
  readonly capacity?: number;
}

function requireCapacity(capacity: number): number {
  if (!Number.isInteger(capacity) || capacity < 0) {
    throw new InvalidZoneCapacityError(capacity);
  }
  return capacity;
}

/** Create an access zone (status `active`). Code and name required; capacity a non-negative integer. */
export function createAccessZone(params: CreateAccessZoneParams): AccessZone {
  const code = params.code.trim();
  if (code.length === 0) {
    throw new EmptyZoneCodeError();
  }
  const name = params.name.trim();
  if (name.length === 0) {
    throw new EmptyZoneNameError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    code,
    name,
    securityLevel: params.securityLevel,
    capacity: requireCapacity(params.capacity ?? 0),
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (zone: AccessZone, patch: Partial<AccessZone>): AccessZone => ({
  ...zone,
  ...patch,
  updatedAt: nowIso(),
});

/** Rename a zone; not allowed once decommissioned (terminal). */
export function renameZone(zone: AccessZone, name: string): AccessZone {
  if (zone.status === "decommissioned") {
    throw new InvalidZoneTransitionError(zone.status, "renamed");
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new EmptyZoneNameError();
  }
  return touch(zone, { name: trimmed });
}

/** Set the zone's security level; not allowed once decommissioned. */
export function setZoneSecurityLevel(zone: AccessZone, securityLevel: SecurityLevel): AccessZone {
  if (zone.status === "decommissioned") {
    throw new InvalidZoneTransitionError(zone.status, "security-level-set");
  }
  return touch(zone, { securityLevel });
}

/** Set the zone's safe-occupancy capacity (a non-negative integer); not allowed once decommissioned. */
export function setZoneCapacity(zone: AccessZone, capacity: number): AccessZone {
  if (zone.status === "decommissioned") {
    throw new InvalidZoneTransitionError(zone.status, "capacity-set");
  }
  return touch(zone, { capacity: requireCapacity(capacity) });
}

/** Lock down an active zone (→ `locked_down`, a temporary emergency freeze). */
export function lockDownZone(zone: AccessZone): AccessZone {
  if (zone.status !== "active") {
    throw new InvalidZoneTransitionError(zone.status, "locked_down");
  }
  return touch(zone, { status: "locked_down" });
}

/** Lift a zone's lockdown (→ `active`). */
export function liftZoneLockdown(zone: AccessZone): AccessZone {
  if (zone.status !== "locked_down") {
    throw new InvalidZoneTransitionError(zone.status, "active");
  }
  return touch(zone, { status: "active" });
}

/** Decommission a zone (→ `decommissioned`, terminal). */
export function decommissionZone(zone: AccessZone): AccessZone {
  if (zone.status === "decommissioned") {
    throw new InvalidZoneTransitionError(zone.status, "decommissioned");
  }
  return touch(zone, { status: "decommissioned" });
}

/** Whether the zone is active (open to normal access). */
export const isZoneActive = (zone: AccessZone): boolean => zone.status === "active";

/** Whether the zone still exists in service (not decommissioned) and can take attachments. */
export const isZoneInService = (zone: AccessZone): boolean => zone.status !== "decommissioned";
