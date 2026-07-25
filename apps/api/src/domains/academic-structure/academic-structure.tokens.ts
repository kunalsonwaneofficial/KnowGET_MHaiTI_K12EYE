/** Dependency-injection tokens for the Academic Structure & Curriculum Platform (P2-D06). */

// Repositories (Prisma/RLS adapters over the academic-structure ports).
export const AS_CALENDAR_REPOSITORY = Symbol("AS_CALENDAR_REPOSITORY");
export const AS_PROGRAM_REPOSITORY = Symbol("AS_PROGRAM_REPOSITORY");
export const AS_CURRICULUM_REPOSITORY = Symbol("AS_CURRICULUM_REPOSITORY");
export const AS_GRADE_REPOSITORY = Symbol("AS_GRADE_REPOSITORY");
export const AS_CLASS_REPOSITORY = Symbol("AS_CLASS_REPOSITORY");
export const AS_SECTION_REPOSITORY = Symbol("AS_SECTION_REPOSITORY");
export const AS_SUBJECT_REPOSITORY = Symbol("AS_SUBJECT_REPOSITORY");
export const AS_LEARNING_OUTCOME_REPOSITORY = Symbol("AS_LEARNING_OUTCOME_REPOSITORY");

// Cross-domain read port (directory over Organization / P2-D01-M01).
export const AS_ORGANIZATION_DIRECTORY = Symbol("AS_ORGANIZATION_DIRECTORY");

// Application services.
export const AS_CALENDAR_SERVICE = Symbol("AS_CALENDAR_SERVICE");
export const AS_PROGRAM_SERVICE = Symbol("AS_PROGRAM_SERVICE");
export const AS_CURRICULUM_SERVICE = Symbol("AS_CURRICULUM_SERVICE");
export const AS_GRADE_SERVICE = Symbol("AS_GRADE_SERVICE");
export const AS_CLASS_SERVICE = Symbol("AS_CLASS_SERVICE");
export const AS_SECTION_SERVICE = Symbol("AS_SECTION_SERVICE");
export const AS_SUBJECT_SERVICE = Symbol("AS_SUBJECT_SERVICE");
export const AS_LEARNING_OUTCOME_SERVICE = Symbol("AS_LEARNING_OUTCOME_SERVICE");
