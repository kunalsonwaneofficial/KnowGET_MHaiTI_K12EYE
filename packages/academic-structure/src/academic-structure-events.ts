import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { AcademicCalendar } from "./academic-calendar";

// --- Academic calendar -----------------------------------------------------------
export const ACADEMIC_YEAR_CREATED = "academic.year.created";
export const ACADEMIC_CALENDAR_PUBLISHED = "academic.calendar.published";

export interface AcademicCalendarEventPayload {
  readonly academicCalendarId: Uuid;
  readonly organizationId: Uuid;
  readonly academicYear: string;
}

export type AcademicYearCreatedEvent = DomainEvent<
  typeof ACADEMIC_YEAR_CREATED,
  AcademicCalendarEventPayload
>;

export type AcademicCalendarPublishedEvent = DomainEvent<
  typeof ACADEMIC_CALENDAR_PUBLISHED,
  AcademicCalendarEventPayload
>;

const calendarPayload = (calendar: AcademicCalendar): AcademicCalendarEventPayload => ({
  academicCalendarId: calendar.id,
  organizationId: calendar.organizationId,
  academicYear: calendar.academicYear,
});

export const academicYearCreated = (calendar: AcademicCalendar): AcademicYearCreatedEvent =>
  createEvent(ACADEMIC_YEAR_CREATED, calendarPayload(calendar), { tenantId: calendar.tenantId });

export const academicCalendarPublished = (
  calendar: AcademicCalendar,
): AcademicCalendarPublishedEvent =>
  createEvent(ACADEMIC_CALENDAR_PUBLISHED, calendarPayload(calendar), {
    tenantId: calendar.tenantId,
  });
