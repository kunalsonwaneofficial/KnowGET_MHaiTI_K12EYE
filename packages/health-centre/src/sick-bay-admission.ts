import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyBedLabelError, InvalidAdmissionTransitionError } from "./errors";
import type { AdmissionStatus } from "./health-centre-value";

/**
 * A sick-bay admission — a patient (a Person) placed in a sick-bay bed at a health centre for observation
 * or rest. It carries the bed it occupies, an admitted-on stamp, an optional reason (held on the aggregate
 * but never placed on a domain event), and, on discharge, a discharged-on stamp. It runs `active →
 * discharged`. Active admissions are what the pure occupancy engine counts against the centre's sick-bay
 * capacity; the service enforces one active admission per bed and one active per patient. The organization
 * is derived from the centre.
 */
export interface SickBayAdmission {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly centreId: Uuid;
  readonly patientId: Uuid;
  readonly bedLabel: string;
  readonly admittedOn: string;
  readonly reason: string | null;
  readonly dischargedOn: string | null;
  readonly status: AdmissionStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface AdmitToSickBayParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly centreId: Uuid;
  readonly patientId: Uuid;
  readonly bedLabel: string;
  readonly admittedOn: string;
  readonly reason?: string | null;
}

/** Admit a patient to a sick-bay bed (status `active`). */
export function admitToSickBay(params: AdmitToSickBayParams): SickBayAdmission {
  const bedLabel = params.bedLabel.trim();
  if (bedLabel.length === 0) {
    throw new EmptyBedLabelError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    centreId: params.centreId,
    patientId: params.patientId,
    bedLabel,
    admittedOn: params.admittedOn,
    reason: params.reason?.trim() || null,
    dischargedOn: null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  admission: SickBayAdmission,
  patch: Partial<SickBayAdmission>,
): SickBayAdmission => ({
  ...admission,
  ...patch,
  updatedAt: nowIso(),
});

/** Discharge a patient from the sick bay (→ `discharged`). */
export function dischargeFromSickBay(
  admission: SickBayAdmission,
  dischargedOn: string,
): SickBayAdmission {
  if (admission.status !== "active") {
    throw new InvalidAdmissionTransitionError(admission.status, "discharged");
  }
  return touch(admission, { status: "discharged", dischargedOn });
}

/** Whether the admission is active (the patient is currently in the sick bay). */
export const isAdmissionActive = (admission: SickBayAdmission): boolean =>
  admission.status === "active";
