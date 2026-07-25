import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { AcademicCalendar } from "./academic-calendar";
import type { CurriculumFramework } from "./curriculum-framework";
import type { Grade } from "./grade";

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

// --- Curriculum framework --------------------------------------------------------
export const CURRICULUM_CREATED = "academic.curriculum.created";
export const CURRICULUM_REVISED = "academic.curriculum.revised";

export interface CurriculumEventPayload {
  readonly curriculumFrameworkId: Uuid;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly version: number;
}

export type CurriculumCreatedEvent = DomainEvent<typeof CURRICULUM_CREATED, CurriculumEventPayload>;
export type CurriculumRevisedEvent = DomainEvent<typeof CURRICULUM_REVISED, CurriculumEventPayload>;

const curriculumPayload = (framework: CurriculumFramework): CurriculumEventPayload => ({
  curriculumFrameworkId: framework.id,
  organizationId: framework.organizationId,
  code: framework.code,
  version: framework.version,
});

export const curriculumCreated = (framework: CurriculumFramework): CurriculumCreatedEvent =>
  createEvent(CURRICULUM_CREATED, curriculumPayload(framework), { tenantId: framework.tenantId });

export const curriculumRevised = (framework: CurriculumFramework): CurriculumRevisedEvent =>
  createEvent(CURRICULUM_REVISED, curriculumPayload(framework), { tenantId: framework.tenantId });

// --- Grade -----------------------------------------------------------------------
export const GRADE_CREATED = "academic.grade.created";

export interface GradeCreatedPayload {
  readonly gradeId: Uuid;
  readonly organizationId: Uuid;
  readonly programId: Uuid;
  readonly level: number;
}

export type GradeCreatedEvent = DomainEvent<typeof GRADE_CREATED, GradeCreatedPayload>;

export const gradeCreated = (grade: Grade): GradeCreatedEvent =>
  createEvent(
    GRADE_CREATED,
    {
      gradeId: grade.id,
      organizationId: grade.organizationId,
      programId: grade.programId,
      level: grade.level,
    },
    { tenantId: grade.tenantId },
  );
