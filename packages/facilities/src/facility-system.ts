import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptySystemCodeError,
  InvalidServiceIntervalError,
  InvalidSystemTransitionError,
} from "./errors";
import type { SystemStatus, SystemType } from "./facilities-value";

/**
 * A facility system — a fixed infrastructure system serving a building (HVAC, electrical, plumbing,
 * elevator, fire-safety, network or water). It carries a code (unique within its building), a type, a
 * commissioned date, a service interval and the date it was last serviced. It runs `operational ↔
 * under_maintenance → decommissioned`. Its service status (ok / due_soon / overdue) is **derived** by the
 * pure engine from the last-serviced date and the interval — never stored. Its capital value and costed
 * maintenance are the Asset register's (P2-D15); nothing here is money.
 */
export interface FacilitySystem {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly buildingId: Uuid;
  readonly code: string;
  readonly type: SystemType;
  readonly commissionedOn: string;
  readonly serviceIntervalDays: number;
  readonly lastServicedOn: string | null;
  readonly status: SystemStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CommissionSystemParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly buildingId: Uuid;
  readonly code: string;
  readonly type: SystemType;
  readonly commissionedOn: string;
  readonly serviceIntervalDays: number;
  readonly lastServicedOn?: string | null;
}

function requireInterval(days: number): number {
  if (!Number.isInteger(days) || days < 1) {
    throw new InvalidServiceIntervalError(days);
  }
  return days;
}

/** Commission a facility system (status `operational`). Code required; interval a positive integer. */
export function commissionSystem(params: CommissionSystemParams): FacilitySystem {
  const code = params.code.trim();
  if (code.length === 0) {
    throw new EmptySystemCodeError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    buildingId: params.buildingId,
    code,
    type: params.type,
    commissionedOn: params.commissionedOn,
    serviceIntervalDays: requireInterval(params.serviceIntervalDays),
    lastServicedOn: params.lastServicedOn ?? null,
    status: "operational",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (system: FacilitySystem, patch: Partial<FacilitySystem>): FacilitySystem => ({
  ...system,
  ...patch,
  updatedAt: nowIso(),
});

/** Record that the system was serviced on a date (clearing any due/overdue status). */
export function recordSystemService(system: FacilitySystem, servicedOn: string): FacilitySystem {
  if (system.status === "decommissioned") {
    throw new InvalidSystemTransitionError(system.status, "serviced");
  }
  return touch(system, { lastServicedOn: servicedOn });
}

/** Set the service interval (a positive integer number of days). */
export function setServiceInterval(system: FacilitySystem, days: number): FacilitySystem {
  if (system.status === "decommissioned") {
    throw new InvalidSystemTransitionError(system.status, "interval-set");
  }
  return touch(system, { serviceIntervalDays: requireInterval(days) });
}

/** Take an operational system off for maintenance (→ `under_maintenance`). */
export function sendSystemToMaintenance(system: FacilitySystem): FacilitySystem {
  if (system.status !== "operational") {
    throw new InvalidSystemTransitionError(system.status, "under_maintenance");
  }
  return touch(system, { status: "under_maintenance" });
}

/** Return a system from maintenance to service (→ `operational`). */
export function returnSystemToService(system: FacilitySystem): FacilitySystem {
  if (system.status !== "under_maintenance") {
    throw new InvalidSystemTransitionError(system.status, "operational");
  }
  return touch(system, { status: "operational" });
}

/** Decommission a facility system (→ `decommissioned`, terminal). */
export function decommissionSystem(system: FacilitySystem): FacilitySystem {
  if (system.status === "decommissioned") {
    throw new InvalidSystemTransitionError(system.status, "decommissioned");
  }
  return touch(system, { status: "decommissioned" });
}

/** Whether the system is operational. */
export const isSystemOperational = (system: FacilitySystem): boolean =>
  system.status === "operational";
