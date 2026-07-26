import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { InvalidClinicianTransitionError } from "./errors";
import type { ClinicianRole, ClinicianStatus } from "./health-centre-value";

/**
 * A clinician — a staff member (Employee, P2-D12) who delivers care: a physician, nurse, dentist,
 * paramedic, pharmacist or psychologist, carrying an optional professional registration/licence number.
 * It runs `active ↔ suspended` and `→ relieved` (a terminal end). The employee's identity lives in the
 * workforce domain and is never duplicated here; the organization is derived from the employee, and one
 * clinician is allowed per employee.
 */
export interface Clinician {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly role: ClinicianRole;
  readonly registrationNumber: string | null;
  readonly status: ClinicianStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RegisterClinicianParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly role: ClinicianRole;
  readonly registrationNumber?: string | null;
}

/** Register a clinician (status `active`). */
export function registerClinician(params: RegisterClinicianParams): Clinician {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    employeeId: params.employeeId,
    role: params.role,
    registrationNumber: params.registrationNumber?.trim() || null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (clinician: Clinician, patch: Partial<Clinician>): Clinician => ({
  ...clinician,
  ...patch,
  updatedAt: nowIso(),
});

/** Set the clinician's clinical role. */
export const setClinicianRole = (clinician: Clinician, role: ClinicianRole): Clinician =>
  touch(clinician, { role });

/** Set (or clear) the clinician's professional registration/licence number. */
export const setRegistrationNumber = (
  clinician: Clinician,
  registrationNumber: string | null,
): Clinician => touch(clinician, { registrationNumber: registrationNumber?.trim() || null });

/** Suspend an active clinician (→ `suspended`). */
export function suspendClinician(clinician: Clinician): Clinician {
  if (clinician.status !== "active") {
    throw new InvalidClinicianTransitionError(clinician.status, "suspended");
  }
  return touch(clinician, { status: "suspended" });
}

/** Reinstate a suspended clinician (→ `active`). */
export function reinstateClinician(clinician: Clinician): Clinician {
  if (clinician.status !== "suspended") {
    throw new InvalidClinicianTransitionError(clinician.status, "active");
  }
  return touch(clinician, { status: "active" });
}

/** Relieve a clinician of the clinical role permanently (→ `relieved`, terminal). */
export function relieveClinician(clinician: Clinician): Clinician {
  if (clinician.status === "relieved") {
    throw new InvalidClinicianTransitionError(clinician.status, "relieved");
  }
  return touch(clinician, { status: "relieved" });
}

/** Whether the clinician is active (assignable and attributable to clinical work). */
export const isClinicianActive = (clinician: Clinician): boolean => clinician.status === "active";
