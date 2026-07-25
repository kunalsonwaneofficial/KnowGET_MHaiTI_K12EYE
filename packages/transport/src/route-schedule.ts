import { InvalidRouteScheduleError } from "./errors";
import type {
  FleetUtilizationSummary,
  RouteSchedule,
  RouteStopArrival,
  RouteStopScheduleView,
  RouteUtilizationMemberView,
  SeatUtilization,
} from "./transport-view";

const MINUTES_PER_DAY = 24 * 60;

/**
 * The pure route-schedule engine — turns a route's ordered stops (each a 1-based sequence and a minutes
 * offset from departure) plus a departure time into per-stop arrival times, the total run duration and
 * the final arrival. It validates that sequence numbers are consecutive from 1 and that offsets strictly
 * increase along the route, so a malformed stop list can never yield a schedule. Pure, deterministic and
 * clock-free — the caller passes the departure minute-of-day. Built and tested before any aggregate
 * depends on it.
 */
export function computeRouteSchedule(
  departureMinutes: number,
  stops: readonly RouteStopScheduleView[],
): RouteSchedule {
  if (
    !Number.isInteger(departureMinutes) ||
    departureMinutes < 0 ||
    departureMinutes >= MINUTES_PER_DAY
  ) {
    throw new InvalidRouteScheduleError(
      "the departure time must be an integer number of minutes since midnight in [0, 1440)",
    );
  }
  if (stops.length === 0) {
    throw new InvalidRouteScheduleError("a route must have at least one stop");
  }
  const arrivals: RouteStopArrival[] = [];
  let expectedSequence = 1;
  let previousOffset = -1;
  for (const stop of stops) {
    if (!Number.isInteger(stop.sequence) || stop.sequence !== expectedSequence) {
      throw new InvalidRouteScheduleError(
        "stop sequence numbers must be consecutive integers starting at 1",
      );
    }
    if (!Number.isInteger(stop.offsetMinutes) || stop.offsetMinutes < 0) {
      throw new InvalidRouteScheduleError(
        "a stop offset must be a non-negative integer number of minutes from departure",
      );
    }
    if (stop.offsetMinutes <= previousOffset) {
      throw new InvalidRouteScheduleError("stop offsets must strictly increase along the route");
    }
    arrivals.push({
      sequence: stop.sequence,
      offsetMinutes: stop.offsetMinutes,
      arrivalMinutes: departureMinutes + stop.offsetMinutes,
    });
    expectedSequence += 1;
    previousOffset = stop.offsetMinutes;
  }
  return {
    departureMinutes,
    stopCount: arrivals.length,
    totalDurationMinutes: previousOffset,
    finalArrivalMinutes: departureMinutes + previousOffset,
    stops: arrivals,
  };
}

/**
 * The pure seat-utilization engine — a route's assigned vehicle capacity against its active subscriber
 * count: the seats available (negative when over-subscribed), the utilization percent, and whether it is
 * over capacity. Pure and deterministic.
 */
export function computeSeatUtilization(capacity: number, subscriberCount: number): SeatUtilization {
  return {
    capacity,
    subscriberCount,
    seatsAvailable: capacity - subscriberCount,
    utilizationPercent: capacity > 0 ? Math.round((subscriberCount / capacity) * 100) : 0,
    overCapacity: subscriberCount > capacity,
  };
}

/**
 * The pure fleet-rollup engine — summarizes a set of route utilizations into a leadership picture: route
 * count, total subscribers, and the count of over-subscribed routes. Pure and deterministic.
 */
export function summarizeFleetUtilization(
  members: readonly RouteUtilizationMemberView[],
): FleetUtilizationSummary {
  let totalSubscribers = 0;
  let overCapacityRouteCount = 0;
  for (const member of members) {
    totalSubscribers += member.subscriberCount;
    if (member.overCapacity) {
      overCapacityRouteCount += 1;
    }
  }
  return {
    routeCount: members.length,
    totalSubscribers,
    overCapacityRouteCount,
  };
}
