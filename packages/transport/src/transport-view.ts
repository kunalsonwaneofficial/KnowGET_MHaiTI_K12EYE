import type { TripEventType } from "./transport-value";

/**
 * The narrow views the pure engines consume. The aggregates structurally satisfy them, so the engines
 * depend on no aggregate — the same pure-engine-over-views pattern used across P2-D07…D15.
 */

// --- Route-schedule engine -------------------------------------------------------

/** The minimal view of a route stop the schedule engine needs: its 1-based order and minutes offset. */
export interface RouteStopScheduleView {
  readonly sequence: number;
  readonly offsetMinutes: number;
}

/** A stop's computed arrival — its offset from departure and its clock arrival (minutes since midnight). */
export interface RouteStopArrival {
  readonly sequence: number;
  readonly offsetMinutes: number;
  readonly arrivalMinutes: number;
}

/**
 * A route's computed schedule from a departure time — the per-stop arrivals, the stop count, the total
 * run duration and the final arrival, all in minutes. Pure and clock-free (the caller passes departure).
 */
export interface RouteSchedule {
  readonly departureMinutes: number;
  readonly stopCount: number;
  readonly totalDurationMinutes: number;
  readonly finalArrivalMinutes: number;
  readonly stops: readonly RouteStopArrival[];
}

// --- Seat utilization ------------------------------------------------------------

/**
 * A route's seat utilization — its assigned vehicle capacity against its active subscriber count: the
 * seats still available (may be negative when over-subscribed), the utilization percent, and whether it
 * is over capacity. Descriptive and exact.
 */
export interface SeatUtilization {
  readonly capacity: number;
  readonly subscriberCount: number;
  readonly seatsAvailable: number;
  readonly utilizationPercent: number;
  readonly overCapacity: boolean;
}

/** The minimal view of a route's utilization the fleet rollup needs. */
export interface RouteUtilizationMemberView {
  readonly subscriberCount: number;
  readonly overCapacity: boolean;
}

/**
 * A leadership-facing rollup of a fleet's routes — route count, total subscribers, and the count of
 * over-subscribed routes. Descriptive only.
 */
export interface FleetUtilizationSummary {
  readonly routeCount: number;
  readonly totalSubscribers: number;
  readonly overCapacityRouteCount: number;
}

// --- Trip-occupancy engine -------------------------------------------------------

/** The minimal view of a trip boarding event the occupancy engine needs (its ordered type). */
export interface TripEventView {
  readonly type: TripEventType;
}

/**
 * A trip's reconciled occupancy from its ordered boarding/alighting events — the running-end onboard
 * count, the peak occupancy reached, the boarded/alighted tallies, and whether the peak exceeded the
 * vehicle's capacity. The transport analog of the stock-balance engine: an event ledger reconciled into
 * a running quantity, capacity-checked. Pure and exact.
 */
export interface TripOccupancy {
  readonly capacity: number;
  readonly finalOnboard: number;
  readonly peakOccupancy: number;
  readonly boardedCount: number;
  readonly alightedCount: number;
  readonly eventCount: number;
  readonly capacityExceeded: boolean;
  readonly utilizationPercent: number;
}
