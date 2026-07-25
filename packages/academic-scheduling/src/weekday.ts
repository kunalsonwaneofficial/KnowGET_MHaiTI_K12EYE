/**
 * A day of the school week. Schedule slots, availability windows and allocations are
 * placed on a weekday; the platform is agnostic to concrete calendar dates (those belong
 * to the academic calendar, P2-D06), scheduling only the recurring weekly grid.
 */
export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

/** Narrow an arbitrary string to a {@link Weekday}. */
export const isWeekday = (value: string): value is Weekday =>
  (WEEKDAYS as readonly string[]).includes(value);
