/** Dependency-injection tokens for the Academic Scheduling & Resource Orchestration Platform (P2-D07). */

// Repositories (Prisma/RLS adapters over the academic-scheduling ports).
export const SCHED_TIMETABLE_REPOSITORY = Symbol("SCHED_TIMETABLE_REPOSITORY");
export const SCHED_SLOT_REPOSITORY = Symbol("SCHED_SLOT_REPOSITORY");
export const SCHED_RESOURCE_REPOSITORY = Symbol("SCHED_RESOURCE_REPOSITORY");
export const SCHED_ALLOCATION_REPOSITORY = Symbol("SCHED_ALLOCATION_REPOSITORY");
export const SCHED_POLICY_REPOSITORY = Symbol("SCHED_POLICY_REPOSITORY");
export const SCHED_SUBSTITUTION_REPOSITORY = Symbol("SCHED_SUBSTITUTION_REPOSITORY");

// Cross-domain read ports (directories over Organization, academic-structure and Person).
export const SCHED_ORGANIZATION_DIRECTORY = Symbol("SCHED_ORGANIZATION_DIRECTORY");
export const SCHED_GRADE_DIRECTORY = Symbol("SCHED_GRADE_DIRECTORY");
export const SCHED_CLASS_DIRECTORY = Symbol("SCHED_CLASS_DIRECTORY");
export const SCHED_SECTION_DIRECTORY = Symbol("SCHED_SECTION_DIRECTORY");
export const SCHED_SUBJECT_DIRECTORY = Symbol("SCHED_SUBJECT_DIRECTORY");
export const SCHED_TEACHER_DIRECTORY = Symbol("SCHED_TEACHER_DIRECTORY");
export const SCHED_RESOURCE_DIRECTORY = Symbol("SCHED_RESOURCE_DIRECTORY");

// Application services.
export const SCHED_TIMETABLE_SERVICE = Symbol("SCHED_TIMETABLE_SERVICE");
export const SCHED_SLOT_SERVICE = Symbol("SCHED_SLOT_SERVICE");
export const SCHED_RESOURCE_SERVICE = Symbol("SCHED_RESOURCE_SERVICE");
export const SCHED_ALLOCATION_SERVICE = Symbol("SCHED_ALLOCATION_SERVICE");
export const SCHED_POLICY_SERVICE = Symbol("SCHED_POLICY_SERVICE");
export const SCHED_SUBSTITUTION_SERVICE = Symbol("SCHED_SUBSTITUTION_SERVICE");
