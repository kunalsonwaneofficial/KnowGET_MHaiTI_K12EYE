import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyCentreCodeError,
  EmptyCentreNameError,
  InvalidCapacityError,
  InvalidHealthCentreTransitionError,
} from "./errors";
import type { CentreStatus, CentreType } from "./health-centre-value";

/**
 * A health centre — a clinical facility the institution operates (an infirmary, clinic, dental,
 * counselling or wellness centre). It carries a code (unique within the tenant), a name, a type, a
 * sick-bay bed capacity (the beds available for observation admissions) and an optionally assigned lead
 * clinician. It runs `active ↔ under_maintenance` (temporarily closed) and `→ decommissioned` (a terminal
 * end of service). Only an `active` centre can take appointments, encounters and admissions. The
 * organization is the campus node the centre belongs to.
 */
export interface HealthCentre {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly type: CentreType;
  readonly sickBayCapacity: number;
  readonly leadClinicianId: Uuid | null;
  readonly status: CentreStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RegisterHealthCentreParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly type: CentreType;
  readonly sickBayCapacity?: number;
}

function requireCapacity(capacity: number): number {
  if (!Number.isInteger(capacity) || capacity < 0) {
    throw new InvalidCapacityError(capacity);
  }
  return capacity;
}

/** Register a health centre (status `active`). Code and name required; capacity a non-negative integer. */
export function registerHealthCentre(params: RegisterHealthCentreParams): HealthCentre {
  const code = params.code.trim();
  if (code.length === 0) {
    throw new EmptyCentreCodeError();
  }
  const name = params.name.trim();
  if (name.length === 0) {
    throw new EmptyCentreNameError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    code,
    name,
    type: params.type,
    sickBayCapacity: requireCapacity(params.sickBayCapacity ?? 0),
    leadClinicianId: null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (centre: HealthCentre, patch: Partial<HealthCentre>): HealthCentre => ({
  ...centre,
  ...patch,
  updatedAt: nowIso(),
});

/** Rename a health centre. */
export function renameHealthCentre(centre: HealthCentre, name: string): HealthCentre {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new EmptyCentreNameError();
  }
  return touch(centre, { name: trimmed });
}

/** Set the sick-bay bed capacity (a non-negative integer). */
export function setSickBayCapacity(centre: HealthCentre, capacity: number): HealthCentre {
  return touch(centre, { sickBayCapacity: requireCapacity(capacity) });
}

/** Assign a lead clinician to the centre (the service validates the clinician is active). */
export const assignLeadClinician = (centre: HealthCentre, clinicianId: Uuid): HealthCentre =>
  touch(centre, { leadClinicianId: clinicianId });

/** Clear the centre's assigned lead clinician. */
export const unassignLeadClinician = (centre: HealthCentre): HealthCentre =>
  touch(centre, { leadClinicianId: null });

/** Take an active centre off service for maintenance (→ `under_maintenance`). */
export function sendCentreToMaintenance(centre: HealthCentre): HealthCentre {
  if (centre.status !== "active") {
    throw new InvalidHealthCentreTransitionError(centre.status, "under_maintenance");
  }
  return touch(centre, { status: "under_maintenance" });
}

/** Return a centre from maintenance to service (→ `active`). */
export function returnCentreFromMaintenance(centre: HealthCentre): HealthCentre {
  if (centre.status !== "under_maintenance") {
    throw new InvalidHealthCentreTransitionError(centre.status, "active");
  }
  return touch(centre, { status: "active" });
}

/** Decommission a health centre (→ `decommissioned`, terminal). */
export function decommissionCentre(centre: HealthCentre): HealthCentre {
  if (centre.status === "decommissioned") {
    throw new InvalidHealthCentreTransitionError(centre.status, "decommissioned");
  }
  return touch(centre, { status: "decommissioned" });
}

/** Whether the centre is active and available to take clinical operations. */
export const isHealthCentreActive = (centre: HealthCentre): boolean => centre.status === "active";
