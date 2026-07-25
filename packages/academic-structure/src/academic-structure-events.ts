import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { AcademicCalendar } from "./academic-calendar";
import type { AcademicClass } from "./academic-class";
import type { CurriculumFramework } from "./curriculum-framework";
import type { Grade } from "./grade";
import type { LearningOutcome } from "./learning-outcome";
import type { Section } from "./section";
import type { Subject } from "./subject";

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

// --- Class -----------------------------------------------------------------------
export const CLASS_CREATED = "academic.class.created";

export interface ClassCreatedPayload {
  readonly classId: Uuid;
  readonly organizationId: Uuid;
  readonly gradeId: Uuid;
  readonly academicYear: string;
}

export type ClassCreatedEvent = DomainEvent<typeof CLASS_CREATED, ClassCreatedPayload>;

export const classCreated = (klass: AcademicClass): ClassCreatedEvent =>
  createEvent(
    CLASS_CREATED,
    {
      classId: klass.id,
      organizationId: klass.organizationId,
      gradeId: klass.gradeId,
      academicYear: klass.academicYear,
    },
    { tenantId: klass.tenantId },
  );

// --- Section ---------------------------------------------------------------------
export const SECTION_CREATED = "academic.section.created";

export interface SectionCreatedPayload {
  readonly sectionId: Uuid;
  readonly organizationId: Uuid;
  readonly classId: Uuid;
  readonly capacity: number;
}

export type SectionCreatedEvent = DomainEvent<typeof SECTION_CREATED, SectionCreatedPayload>;

export const sectionCreated = (section: Section): SectionCreatedEvent =>
  createEvent(
    SECTION_CREATED,
    {
      sectionId: section.id,
      organizationId: section.organizationId,
      classId: section.classId,
      capacity: section.capacity,
    },
    { tenantId: section.tenantId },
  );

// --- Subject ---------------------------------------------------------------------
export const SUBJECT_REGISTERED = "academic.subject.registered";
export const SUBJECT_UPDATED = "academic.subject.updated";

export interface SubjectEventPayload {
  readonly subjectId: Uuid;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly version: number;
}

export type SubjectRegisteredEvent = DomainEvent<typeof SUBJECT_REGISTERED, SubjectEventPayload>;
export type SubjectUpdatedEvent = DomainEvent<typeof SUBJECT_UPDATED, SubjectEventPayload>;

const subjectPayload = (subject: Subject): SubjectEventPayload => ({
  subjectId: subject.id,
  organizationId: subject.organizationId,
  code: subject.code,
  version: subject.version,
});

export const subjectRegistered = (subject: Subject): SubjectRegisteredEvent =>
  createEvent(SUBJECT_REGISTERED, subjectPayload(subject), { tenantId: subject.tenantId });

export const subjectUpdated = (subject: Subject): SubjectUpdatedEvent =>
  createEvent(SUBJECT_UPDATED, subjectPayload(subject), { tenantId: subject.tenantId });

// --- Learning outcome ------------------------------------------------------------
export const LEARNING_OUTCOME_DEFINED = "academic.learning_outcome.defined";

export interface LearningOutcomeDefinedPayload {
  readonly learningOutcomeId: Uuid;
  readonly organizationId: Uuid;
  readonly subjectId: Uuid;
  readonly code: string;
}

export type LearningOutcomeDefinedEvent = DomainEvent<
  typeof LEARNING_OUTCOME_DEFINED,
  LearningOutcomeDefinedPayload
>;

export const learningOutcomeDefined = (outcome: LearningOutcome): LearningOutcomeDefinedEvent =>
  createEvent(
    LEARNING_OUTCOME_DEFINED,
    {
      learningOutcomeId: outcome.id,
      organizationId: outcome.organizationId,
      subjectId: outcome.subjectId,
      code: outcome.code,
    },
    { tenantId: outcome.tenantId },
  );
