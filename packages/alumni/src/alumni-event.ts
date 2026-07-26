import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyEventCodeError,
  EmptyEventNameError,
  InvalidEventCapacityError,
  InvalidEventTransitionError,
} from "./errors";
import type { EventStatus, EventType } from "./alumni-value";

/**
 * An alumni event — a reunion, networking session, webinar, fundraiser or volunteer day, with a code (unique
 * per tenant), a type, an optional capacity (0 = untracked/no cap) and an optional date window. It runs
 * `draft → scheduled → open → closed → completed`, with `cancelled` from any pre-completed state;
 * registrations are taken only while `open`, and the configuration is editable until the event closes. Its
 * registrations are the separate {@link EventRegistration} aggregate; the participation engine values fill and
 * attendance against the capacity.
 */
export interface AlumniEvent {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly type: EventType;
  readonly capacity: number;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly status: EventStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateAlumniEventParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly type: EventType;
  readonly capacity?: number;
  readonly startsOn?: string | null;
  readonly endsOn?: string | null;
}

function validateCapacity(capacity: number): number {
  if (!Number.isInteger(capacity) || capacity < 0) {
    throw new InvalidEventCapacityError(capacity);
  }
  return capacity;
}

/** Create an alumni event (status `draft`). Code and name required; capacity a non-negative integer. */
export function createAlumniEvent(params: CreateAlumniEventParams): AlumniEvent {
  const code = params.code.trim();
  if (code.length === 0) {
    throw new EmptyEventCodeError();
  }
  const name = params.name.trim();
  if (name.length === 0) {
    throw new EmptyEventNameError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    code,
    name,
    type: params.type,
    capacity: validateCapacity(params.capacity ?? 0),
    startsOn: params.startsOn?.trim() || null,
    endsOn: params.endsOn?.trim() || null,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (event: AlumniEvent, patch: Partial<AlumniEvent>): AlumniEvent => ({
  ...event,
  ...patch,
  updatedAt: nowIso(),
});

/** Whether the event's configuration is still editable — before it closes, completes or is cancelled. */
const isConfigurable = (event: AlumniEvent): boolean =>
  event.status === "draft" || event.status === "scheduled" || event.status === "open";

/** Rename an event; not allowed once closed, completed or cancelled. */
export function renameEvent(event: AlumniEvent, name: string): AlumniEvent {
  if (!isConfigurable(event)) {
    throw new InvalidEventTransitionError(event.status, "renamed");
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new EmptyEventNameError();
  }
  return touch(event, { name: trimmed });
}

/** Set the event's type; not allowed once closed, completed or cancelled. */
export function setEventType(event: AlumniEvent, type: EventType): AlumniEvent {
  if (!isConfigurable(event)) {
    throw new InvalidEventTransitionError(event.status, "type-set");
  }
  return touch(event, { type });
}

/** Set the event's capacity; not allowed once closed, completed or cancelled. */
export function setEventCapacity(event: AlumniEvent, capacity: number): AlumniEvent {
  if (!isConfigurable(event)) {
    throw new InvalidEventTransitionError(event.status, "capacity-set");
  }
  return touch(event, { capacity: validateCapacity(capacity) });
}

/** Set the event's date window; not allowed once closed, completed or cancelled. */
export function setEventWindow(
  event: AlumniEvent,
  startsOn: string | null,
  endsOn: string | null,
): AlumniEvent {
  if (!isConfigurable(event)) {
    throw new InvalidEventTransitionError(event.status, "window-set");
  }
  return touch(event, { startsOn: startsOn?.trim() || null, endsOn: endsOn?.trim() || null });
}

/** Schedule a draft event (`draft → scheduled`). */
export function scheduleEvent(event: AlumniEvent): AlumniEvent {
  if (event.status !== "draft") {
    throw new InvalidEventTransitionError(event.status, "scheduled");
  }
  return touch(event, { status: "scheduled" });
}

/** Open a scheduled event for registrations (`scheduled → open`). */
export function openEvent(event: AlumniEvent): AlumniEvent {
  if (event.status !== "scheduled") {
    throw new InvalidEventTransitionError(event.status, "open");
  }
  return touch(event, { status: "open" });
}

/** Close an open event to further registrations (`open → closed`). */
export function closeEvent(event: AlumniEvent): AlumniEvent {
  if (event.status !== "open") {
    throw new InvalidEventTransitionError(event.status, "closed");
  }
  return touch(event, { status: "closed" });
}

/** Complete a closed event (`closed → completed`, terminal). */
export function completeEvent(event: AlumniEvent): AlumniEvent {
  if (event.status !== "closed") {
    throw new InvalidEventTransitionError(event.status, "completed");
  }
  return touch(event, { status: "completed" });
}

/** Cancel a pre-completed event (→ `cancelled`, terminal). */
export function cancelEvent(event: AlumniEvent): AlumniEvent {
  if (event.status === "completed" || event.status === "cancelled") {
    throw new InvalidEventTransitionError(event.status, "cancelled");
  }
  return touch(event, { status: "cancelled" });
}

/** Whether the event is open (accepting registrations). */
export const isEventOpen = (event: AlumniEvent): boolean => event.status === "open";
