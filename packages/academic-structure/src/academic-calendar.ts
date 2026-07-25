import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  type AcademicEvent,
  type CalendarStatus,
  DEFAULT_WORKING_DAYS,
  type ExaminationPeriod,
  type Holiday,
  type HolidayKind,
  type Term,
  type TermType,
  type Weekday,
} from "./calendar";
import {
  AcademicEventNotFoundError,
  CalendarNotDraftError,
  EmptyCalendarEntryError,
  ExaminationPeriodNotFoundError,
  HolidayNotFoundError,
  InvalidDateRangeError,
  TermNotFoundError,
} from "./errors";

/**
 * An organization's official academic schedule for one academic year — the authoritative
 * source of terms/semesters, holidays, working days, examination periods and special
 * events. One per (organization, academic year). Drafts are edited freely and then
 * published; a published calendar remains the live schedule. The calendar owns no
 * teaching, attendance or examination data — only the structure those domains consume.
 */
export interface AcademicCalendar {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly academicYear: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly status: CalendarStatus;
  readonly terms: readonly Term[];
  readonly holidays: readonly Holiday[];
  readonly examinationPeriods: readonly ExaminationPeriod[];
  readonly specialEvents: readonly AcademicEvent[];
  readonly workingDays: readonly Weekday[];
  readonly publishedAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateAcademicCalendarParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly academicYear: string;
  readonly startDate: string;
  readonly endDate: string;
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyCalendarEntryError(field);
  }
  return trimmed;
};

const requireRange = (startDate: string, endDate: string): { start: string; end: string } => {
  const start = requireText(startDate, "start date");
  const end = requireText(endDate, "end date");
  if (end < start) {
    throw new InvalidDateRangeError(start, end);
  }
  return { start, end };
};

/** Create a new draft academic calendar for an organization's academic year. */
export function createAcademicCalendar(params: CreateAcademicCalendarParams): AcademicCalendar {
  const { start, end } = requireRange(params.startDate, params.endDate);
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    academicYear: requireText(params.academicYear, "academic year"),
    startDate: start,
    endDate: end,
    status: "draft",
    terms: [],
    holidays: [],
    examinationPeriods: [],
    specialEvents: [],
    workingDays: [...DEFAULT_WORKING_DAYS],
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (calendar: AcademicCalendar, patch: Partial<AcademicCalendar>): AcademicCalendar => ({
  ...calendar,
  ...patch,
  updatedAt: nowIso(),
});

export interface AddTermInput {
  readonly name: string;
  readonly type: TermType;
  readonly startDate: string;
  readonly endDate: string;
  readonly sequence: number;
}

/** Add a term/semester to the calendar; returns it. */
export function addTerm(
  calendar: AcademicCalendar,
  input: AddTermInput,
): { calendar: AcademicCalendar; term: Term } {
  const { start, end } = requireRange(input.startDate, input.endDate);
  const term: Term = {
    id: newUuid(),
    name: requireText(input.name, "term name"),
    type: input.type,
    startDate: start,
    endDate: end,
    sequence: input.sequence,
  };
  return { calendar: touch(calendar, { terms: [...calendar.terms, term] }), term };
}

/** Remove a term by id. */
export function removeTerm(calendar: AcademicCalendar, termId: Uuid): AcademicCalendar {
  if (!calendar.terms.some((t) => t.id === termId)) {
    throw new TermNotFoundError(termId);
  }
  return touch(calendar, { terms: calendar.terms.filter((t) => t.id !== termId) });
}

export interface AddHolidayInput {
  readonly name: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly kind: HolidayKind;
}

/** Add a holiday/vacation span to the calendar; returns it. */
export function addHoliday(
  calendar: AcademicCalendar,
  input: AddHolidayInput,
): { calendar: AcademicCalendar; holiday: Holiday } {
  const { start, end } = requireRange(input.startDate, input.endDate);
  const holiday: Holiday = {
    id: newUuid(),
    name: requireText(input.name, "holiday name"),
    startDate: start,
    endDate: end,
    kind: input.kind,
  };
  return { calendar: touch(calendar, { holidays: [...calendar.holidays, holiday] }), holiday };
}

/** Remove a holiday by id. */
export function removeHoliday(calendar: AcademicCalendar, holidayId: Uuid): AcademicCalendar {
  if (!calendar.holidays.some((h) => h.id === holidayId)) {
    throw new HolidayNotFoundError(holidayId);
  }
  return touch(calendar, { holidays: calendar.holidays.filter((h) => h.id !== holidayId) });
}

export interface AddExaminationPeriodInput {
  readonly name: string;
  readonly startDate: string;
  readonly endDate: string;
}

/** Add an examination period to the calendar; returns it. */
export function addExaminationPeriod(
  calendar: AcademicCalendar,
  input: AddExaminationPeriodInput,
): { calendar: AcademicCalendar; period: ExaminationPeriod } {
  const { start, end } = requireRange(input.startDate, input.endDate);
  const period: ExaminationPeriod = {
    id: newUuid(),
    name: requireText(input.name, "examination period name"),
    startDate: start,
    endDate: end,
  };
  return {
    calendar: touch(calendar, { examinationPeriods: [...calendar.examinationPeriods, period] }),
    period,
  };
}

/** Remove an examination period by id. */
export function removeExaminationPeriod(
  calendar: AcademicCalendar,
  periodId: Uuid,
): AcademicCalendar {
  if (!calendar.examinationPeriods.some((p) => p.id === periodId)) {
    throw new ExaminationPeriodNotFoundError(periodId);
  }
  return touch(calendar, {
    examinationPeriods: calendar.examinationPeriods.filter((p) => p.id !== periodId),
  });
}

export interface AddAcademicEventInput {
  readonly name: string;
  readonly date: string;
  readonly category: string;
}

/** Add a special academic event to the calendar; returns it. */
export function addSpecialEvent(
  calendar: AcademicCalendar,
  input: AddAcademicEventInput,
): { calendar: AcademicCalendar; event: AcademicEvent } {
  const event: AcademicEvent = {
    id: newUuid(),
    name: requireText(input.name, "event name"),
    date: requireText(input.date, "event date"),
    category: requireText(input.category, "event category"),
  };
  return {
    calendar: touch(calendar, { specialEvents: [...calendar.specialEvents, event] }),
    event,
  };
}

/** Remove a special academic event by id. */
export function removeSpecialEvent(calendar: AcademicCalendar, eventId: Uuid): AcademicCalendar {
  if (!calendar.specialEvents.some((e) => e.id === eventId)) {
    throw new AcademicEventNotFoundError(eventId);
  }
  return touch(calendar, {
    specialEvents: calendar.specialEvents.filter((e) => e.id !== eventId),
  });
}

/** Set the working days of the week (deduplicated). */
export function setWorkingDays(
  calendar: AcademicCalendar,
  weekdays: readonly Weekday[],
): AcademicCalendar {
  return touch(calendar, { workingDays: [...new Set(weekdays)] });
}

/** Publish the calendar — the one-way draft → published transition. */
export function publishCalendar(calendar: AcademicCalendar): AcademicCalendar {
  if (calendar.status !== "draft") {
    throw new CalendarNotDraftError(calendar.id);
  }
  return touch(calendar, { status: "published", publishedAt: nowIso() });
}

/** Archive the calendar (a superseded year). */
export function archiveCalendar(calendar: AcademicCalendar): AcademicCalendar {
  return touch(calendar, { status: "archived" });
}
