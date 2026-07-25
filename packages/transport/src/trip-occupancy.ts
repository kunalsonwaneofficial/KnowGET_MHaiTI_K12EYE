import type { TripEventView, TripOccupancy } from "./transport-view";

/**
 * The pure trip-occupancy engine — reconciles a trip's ordered boarding/alighting events into the
 * running-end onboard count, the peak occupancy reached and the boarded/alighted tallies, and flags
 * whether the peak exceeded the vehicle's capacity. It is the transport analog of the stock-balance
 * engine: an event ledger reconciled into a running quantity, capacity-checked. Pure, deterministic and
 * integer — the service enforces the capacity/onboard invariants at write time using this reconciliation
 * over prior events. Built and tested before any aggregate depends on it.
 */
export function computeTripOccupancy(
  capacity: number,
  events: readonly TripEventView[],
): TripOccupancy {
  let onboard = 0;
  let peakOccupancy = 0;
  let boardedCount = 0;
  let alightedCount = 0;
  let capacityExceeded = false;
  for (const event of events) {
    if (event.type === "boarded") {
      onboard += 1;
      boardedCount += 1;
    } else {
      onboard -= 1;
      alightedCount += 1;
    }
    if (onboard > peakOccupancy) {
      peakOccupancy = onboard;
    }
    if (onboard > capacity) {
      capacityExceeded = true;
    }
  }
  return {
    capacity,
    finalOnboard: onboard,
    peakOccupancy,
    boardedCount,
    alightedCount,
    eventCount: events.length,
    capacityExceeded,
    utilizationPercent: capacity > 0 ? Math.round((peakOccupancy / capacity) * 100) : 0,
  };
}
