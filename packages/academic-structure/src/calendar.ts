import type { Uuid } from "@knowget/types";

/** How an academic period is structured within a year. */
export type TermType = "term" | "semester" | "trimester";

/**
 * A named academic period within an academic year — a term, semester or trimester — with
 * its date range and an ordering sequence. Held on the {@link import("./academic-calendar").AcademicCalendar}.
 */
export interface Term {
  readonly id: Uuid;
  readonly name: string;
  readonly type: TermType;
  readonly startDate: string;
  readonly endDate: string;
  readonly sequence: number;
}

/** The nature of a non-working day on the calendar. */
export type HolidayKind = "public" | "institutional" | "vacation" | "observance";

/** A holiday or vacation span on the academic calendar. */
export interface Holiday {
  readonly id: Uuid;
  readonly name: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly kind: HolidayKind;
}

/** A scheduled examination window on the academic calendar. */
export interface ExaminationPeriod {
  readonly id: Uuid;
  readonly name: string;
  readonly startDate: string;
  readonly endDate: string;
}

/** A special academic event (orientation, sports day, parent meeting, …). */
export interface AcademicEvent {
  readonly id: Uuid;
  readonly name: string;
  readonly date: string;
  readonly category: string;
}

/** A day of the week — the working-days configuration is a set of these. */
export type Weekday =
  "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

/** The lifecycle of an academic calendar: draft until published, then archivable. */
export type CalendarStatus = "draft" | "published" | "archived";

/** The default working week (Monday–Friday) a new calendar starts from. */
export const DEFAULT_WORKING_DAYS: readonly Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
];
