import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { InvalidRegistrationTransitionError } from "./errors";
import type { RegistrationStatus } from "./alumni-value";

/**
 * An event registration — an alumni profile's registration for an event. It runs `registered → attended |
 * no_show | cancelled`, with `cancelled → registered` reinstatement. There is **one registration row per
 * (event, alumni profile)** — re-registering after a cancellation reinstates the existing row — so the
 * uniqueness is absolute and DB-backed, not status-scoped. A non-cancelled registration counts toward the
 * event's fill; an `attended` registration feeds the participation attendance rate and the alumnus's
 * engagement.
 */
export interface EventRegistration {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly eventId: Uuid;
  readonly alumniProfileId: Uuid;
  readonly status: RegistrationStatus;
  readonly registeredOn: string;
  readonly respondedOn: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RegisterForEventParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly eventId: Uuid;
  readonly alumniProfileId: Uuid;
  readonly registeredOn: string;
}

/** Create an event registration (status `registered`). */
export function registerForEvent(params: RegisterForEventParams): EventRegistration {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    eventId: params.eventId,
    alumniProfileId: params.alumniProfileId,
    status: "registered",
    registeredOn: params.registeredOn,
    respondedOn: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  registration: EventRegistration,
  patch: Partial<EventRegistration>,
): EventRegistration => ({
  ...registration,
  ...patch,
  updatedAt: nowIso(),
});

/** Mark a registered attendee present (`registered → attended`), stamping the response date. */
export function markAttended(
  registration: EventRegistration,
  respondedOn: string,
): EventRegistration {
  if (registration.status !== "registered") {
    throw new InvalidRegistrationTransitionError(registration.status, "attended");
  }
  return touch(registration, { status: "attended", respondedOn });
}

/** Mark a registered attendee absent (`registered → no_show`), stamping the response date. */
export function markNoShow(
  registration: EventRegistration,
  respondedOn: string,
): EventRegistration {
  if (registration.status !== "registered") {
    throw new InvalidRegistrationTransitionError(registration.status, "no_show");
  }
  return touch(registration, { status: "no_show", respondedOn });
}

/** Cancel a registration (`registered → cancelled`), stamping the response date. */
export function cancelRegistration(
  registration: EventRegistration,
  respondedOn: string,
): EventRegistration {
  if (registration.status !== "registered") {
    throw new InvalidRegistrationTransitionError(registration.status, "cancelled");
  }
  return touch(registration, { status: "cancelled", respondedOn });
}

/** Reinstate a cancelled registration (`cancelled → registered`), clearing the response date. */
export function reinstateRegistration(
  registration: EventRegistration,
  registeredOn: string,
): EventRegistration {
  if (registration.status !== "cancelled") {
    throw new InvalidRegistrationTransitionError(registration.status, "registered");
  }
  return touch(registration, { status: "registered", registeredOn, respondedOn: null });
}

/** Whether the registration is still confirmed (not cancelled) — it holds a seat. */
export const isRegistrationConfirmed = (registration: EventRegistration): boolean =>
  registration.status !== "cancelled";
