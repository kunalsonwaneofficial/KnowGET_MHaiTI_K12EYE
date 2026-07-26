import type {
  EventParticipation,
  EventParticipationView,
  ParticipationSummary,
} from "./alumni-view";

/** A percent — the part over the whole, clamped and capped to 0–100; an empty whole reads 0%. */
const rate = (part: number, whole: number): number =>
  whole > 0 ? Math.round((Math.min(Math.max(0, part), whole) / whole) * 100) : 0;

/**
 * The pure participation engine — values an event's participation: how full it is against capacity, how many
 * places remain, whether it is over-subscribed, its fill percent and its attendance rate (attended against
 * registered). A capacity of zero means "not capacity-tracked" (no cap): remaining zero, over-subscribed
 * false, fill percent zero — but the attendance rate is still valued from registered vs attended. Pure,
 * deterministic and clock-free. Built and tested before any aggregate depends on it.
 */
export function computeEventParticipation(
  capacity: number,
  registeredCount: number,
  attendedCount: number,
): EventParticipation {
  const cap = Math.max(0, capacity);
  const registered = Math.max(0, registeredCount);
  const attended = Math.max(0, attendedCount);
  const capped = cap > 0;
  return {
    capacity: cap,
    registeredCount: registered,
    attendedCount: attended,
    remaining: capped ? Math.max(0, cap - registered) : 0,
    overSubscribed: capped && registered > cap,
    fillPercent: capped ? rate(registered, cap) : 0,
    attendanceRate: rate(attended, registered),
  };
}

/**
 * The pure participation-rollup engine — summarizes a set of events' participation into a picture: the event
 * count, the total capacity / registered / attended, and the overall fill and attendance rates (capped,
 * empty-safe). Pure and deterministic.
 */
export function summarizeParticipation(
  events: readonly EventParticipationView[],
): ParticipationSummary {
  let totalCapacity = 0;
  let totalRegistered = 0;
  let totalAttended = 0;
  for (const event of events) {
    totalCapacity += Math.max(0, event.capacity);
    totalRegistered += Math.max(0, event.registeredCount);
    totalAttended += Math.max(0, event.attendedCount);
  }
  return {
    eventCount: events.length,
    totalCapacity,
    totalRegistered,
    totalAttended,
    overallFillPercent: rate(totalRegistered, totalCapacity),
    overallAttendanceRate: rate(totalAttended, totalRegistered),
  };
}
