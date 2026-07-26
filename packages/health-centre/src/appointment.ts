import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { InvalidAppointmentTransitionError } from "./errors";
import type { AppointmentStatus } from "./health-centre-value";

/**
 * An appointment — a scheduled visit for a patient (a Person) at a health centre, optionally with a named
 * clinician. It runs `requested → scheduled → checked_in → completed`, and may end `cancelled` (from any
 * open state) or `no_show` (a scheduled patient who did not arrive). Pure scheduling: the clinical detail
 * of the visit lives on the encounter, not here. The organization is derived from the centre.
 */
export interface Appointment {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly centreId: Uuid;
  readonly patientId: Uuid;
  readonly clinicianId: Uuid | null;
  readonly scheduledFor: string;
  readonly status: AppointmentStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RequestAppointmentParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly centreId: Uuid;
  readonly patientId: Uuid;
  readonly scheduledFor: string;
  readonly clinicianId?: Uuid | null;
}

const OPEN: readonly AppointmentStatus[] = ["requested", "scheduled", "checked_in"];

/** Request an appointment (status `requested`). */
export function requestAppointment(params: RequestAppointmentParams): Appointment {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    centreId: params.centreId,
    patientId: params.patientId,
    clinicianId: params.clinicianId ?? null,
    scheduledFor: params.scheduledFor,
    status: "requested",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (appt: Appointment, patch: Partial<Appointment>): Appointment => ({
  ...appt,
  ...patch,
  updatedAt: nowIso(),
});

/** Confirm a requested appointment onto the books (→ `scheduled`), optionally assigning a clinician. */
export function scheduleAppointment(appt: Appointment, clinicianId?: Uuid | null): Appointment {
  if (appt.status !== "requested") {
    throw new InvalidAppointmentTransitionError(appt.status, "scheduled");
  }
  return touch(appt, {
    status: "scheduled",
    clinicianId: clinicianId === undefined ? appt.clinicianId : clinicianId,
  });
}

/** Move the appointment to a new time while it is still open (not yet checked in). */
export function rescheduleAppointment(appt: Appointment, scheduledFor: string): Appointment {
  if (appt.status !== "requested" && appt.status !== "scheduled") {
    throw new InvalidAppointmentTransitionError(appt.status, "rescheduled");
  }
  return touch(appt, { scheduledFor });
}

/** Check the patient in on arrival (→ `checked_in`). */
export function checkInAppointment(appt: Appointment): Appointment {
  if (appt.status !== "scheduled") {
    throw new InvalidAppointmentTransitionError(appt.status, "checked_in");
  }
  return touch(appt, { status: "checked_in" });
}

/** Complete a checked-in appointment (→ `completed`). */
export function completeAppointment(appt: Appointment): Appointment {
  if (appt.status !== "checked_in") {
    throw new InvalidAppointmentTransitionError(appt.status, "completed");
  }
  return touch(appt, { status: "completed" });
}

/** Cancel an open appointment (→ `cancelled`). */
export function cancelAppointment(appt: Appointment): Appointment {
  if (!OPEN.includes(appt.status)) {
    throw new InvalidAppointmentTransitionError(appt.status, "cancelled");
  }
  return touch(appt, { status: "cancelled" });
}

/** Record that a scheduled patient did not arrive (→ `no_show`). */
export function markAppointmentNoShow(appt: Appointment): Appointment {
  if (appt.status !== "scheduled") {
    throw new InvalidAppointmentTransitionError(appt.status, "no_show");
  }
  return touch(appt, { status: "no_show" });
}
