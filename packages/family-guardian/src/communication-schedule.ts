/** A day of the week for a communication schedule window. */
export type DayOfWeek =
  "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

/**
 * A window during which a family prefers to be contacted — a label, the applicable
 * days, and a start / end time (24-hour `HH:MM`). Identified within a profile by its
 * label.
 */
export interface CommunicationSchedule {
  readonly label: string;
  readonly days: readonly DayOfWeek[];
  readonly fromTime: string;
  readonly toTime: string;
}
