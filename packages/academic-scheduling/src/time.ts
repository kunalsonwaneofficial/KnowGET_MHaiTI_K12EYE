import { InvalidTimeError, InvalidTimeRangeError } from "./errors";

/**
 * A wall-clock time of day in 24-hour `HH:MM` form (e.g. `"09:30"`). Branded so a raw
 * string cannot be used where a validated time is expected.
 */
export type TimeOfDay = string & { readonly __timeOfDay: unique symbol };

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Validate and brand an `HH:MM` string as a {@link TimeOfDay}. */
export function toTimeOfDay(value: string): TimeOfDay {
  const trimmed = value.trim();
  if (!TIME_PATTERN.test(trimmed)) {
    throw new InvalidTimeError(value);
  }
  return trimmed as TimeOfDay;
}

/** Minutes since midnight for a validated {@link TimeOfDay}. */
export function minutesOfDay(time: TimeOfDay): number {
  const [hours, minutes] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

/**
 * A half-open time interval `[startMinutes, endMinutes)` within a single day, measured in
 * minutes since midnight. Day equality is compared separately (see the conflict engine);
 * an interval is intentionally day-agnostic so the overlap maths stays simple and pure.
 */
export interface Interval {
  readonly startMinutes: number;
  readonly endMinutes: number;
}

/** Build a validated {@link Interval} from two times; the end must be after the start. */
export function intervalOf(start: TimeOfDay, end: TimeOfDay): Interval {
  const startMinutes = minutesOfDay(start);
  const endMinutes = minutesOfDay(end);
  if (endMinutes <= startMinutes) {
    throw new InvalidTimeRangeError(start, end);
  }
  return { startMinutes, endMinutes };
}

/** Whether two half-open intervals overlap (touching endpoints do not count). */
export const overlaps = (a: Interval, b: Interval): boolean =>
  a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;

/** Whether interval `b` starts exactly where `a` ends — i.e. they are back-to-back. */
export const isAdjacent = (a: Interval, b: Interval): boolean => a.endMinutes === b.startMinutes;

/** Duration of an interval in minutes. */
export const durationMinutes = (interval: Interval): number =>
  interval.endMinutes - interval.startMinutes;
