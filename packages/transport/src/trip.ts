import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  InvalidTripTransitionError,
  StudentNotOnboardError,
  TripNotInProgressError,
  VehicleCapacityExceededError,
} from "./errors";
import { makeTripEvent, type TripEvent, type TripEventInput } from "./trip-event";
import { computeTripOccupancy } from "./trip-occupancy";
import type { RouteDirection, TripStatus } from "./transport-value";
import type { TripOccupancy } from "./transport-view";

/**
 * A trip — a run of a {@link Route} by a {@link Vehicle} and {@link Driver} on a service date. It runs
 * `scheduled → in_progress → completed`, or `cancelled`. While in progress it accumulates an ordered
 * list of boarding/alighting events; a board that would exceed the captured seating `capacity` is
 * rejected (via the pure occupancy engine), and a student may only alight if currently onboard. The
 * organization is derived from the route; the capacity is snapshotted from the vehicle at scheduling.
 */
export interface Trip {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly routeId: Uuid;
  readonly vehicleId: Uuid;
  readonly driverId: Uuid;
  readonly serviceDate: string;
  readonly direction: RouteDirection;
  readonly capacity: number;
  readonly events: readonly TripEvent[];
  readonly status: TripStatus;
  readonly departedAt: ISODateString | null;
  readonly completedAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface ScheduleTripParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly routeId: Uuid;
  readonly vehicleId: Uuid;
  readonly driverId: Uuid;
  readonly serviceDate: string;
  readonly direction: RouteDirection;
  readonly capacity: number;
}

/** Schedule a trip (status `scheduled`, no boarding yet). */
export function scheduleTrip(params: ScheduleTripParams): Trip {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    routeId: params.routeId,
    vehicleId: params.vehicleId,
    driverId: params.driverId,
    serviceDate: params.serviceDate,
    direction: params.direction,
    capacity: params.capacity,
    events: [],
    status: "scheduled",
    departedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (trip: Trip, patch: Partial<Trip>): Trip => ({
  ...trip,
  ...patch,
  updatedAt: nowIso(),
});

/** Whether the given student is currently onboard the trip (boarded more than alighted). */
export function isStudentOnboard(trip: Trip, studentId: Uuid): boolean {
  let net = 0;
  for (const event of trip.events) {
    if (event.studentId === studentId) {
      net += event.type === "boarded" ? 1 : -1;
    }
  }
  return net > 0;
}

/** Start a scheduled trip (→ `in_progress`), stamping the departure time. */
export function startTrip(trip: Trip): Trip {
  if (trip.status !== "scheduled") {
    throw new InvalidTripTransitionError(trip.status, "in_progress");
  }
  return touch(trip, { status: "in_progress", departedAt: nowIso() });
}

/**
 * Record a boarding/alighting event on an in-progress trip. A `boarded` event is rejected if the trip is
 * already at capacity; an `alighted` event is rejected if the student is not currently onboard.
 */
export function recordTripBoarding(trip: Trip, input: TripEventInput): Trip {
  if (trip.status !== "in_progress") {
    throw new TripNotInProgressError(trip.id);
  }
  const event = makeTripEvent(input);
  if (event.type === "boarded") {
    const occupancy = computeTripOccupancy(trip.capacity, trip.events);
    if (occupancy.finalOnboard >= trip.capacity) {
      throw new VehicleCapacityExceededError(trip.id, trip.capacity);
    }
  } else if (!isStudentOnboard(trip, event.studentId)) {
    throw new StudentNotOnboardError(trip.id, event.studentId);
  }
  return touch(trip, { events: [...trip.events, event] });
}

/** Complete an in-progress trip (→ `completed`), stamping the completion time. */
export function completeTrip(trip: Trip): Trip {
  if (trip.status !== "in_progress") {
    throw new InvalidTripTransitionError(trip.status, "completed");
  }
  return touch(trip, { status: "completed", completedAt: nowIso() });
}

/** Cancel a scheduled or in-progress trip (→ `cancelled`). */
export function cancelTrip(trip: Trip): Trip {
  if (trip.status !== "scheduled" && trip.status !== "in_progress") {
    throw new InvalidTripTransitionError(trip.status, "cancelled");
  }
  return touch(trip, { status: "cancelled" });
}

/** The trip's reconciled occupancy (peak, final, capacity-exceeded) via the pure engine. */
export const tripOccupancy = (trip: Trip): TripOccupancy =>
  computeTripOccupancy(trip.capacity, trip.events);
