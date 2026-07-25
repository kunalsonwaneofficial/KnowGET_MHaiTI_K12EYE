/** Dependency-injection tokens for the Attendance & Presence Intelligence Platform (P2-D08). */

// Repositories (Prisma/RLS adapters over the attendance-presence ports).
export const AP_SESSION_REPOSITORY = Symbol("AP_SESSION_REPOSITORY");
export const AP_RECORD_REPOSITORY = Symbol("AP_RECORD_REPOSITORY");
export const AP_LEAVE_REPOSITORY = Symbol("AP_LEAVE_REPOSITORY");
export const AP_POLICY_REPOSITORY = Symbol("AP_POLICY_REPOSITORY");
export const AP_PROFILE_REPOSITORY = Symbol("AP_PROFILE_REPOSITORY");
export const AP_PARTICIPATION_REPOSITORY = Symbol("AP_PARTICIPATION_REPOSITORY");

// Cross-domain read ports (directories over Organization, Person, scheduling and structure).
export const AP_ORGANIZATION_DIRECTORY = Symbol("AP_ORGANIZATION_DIRECTORY");
export const AP_PARTICIPANT_DIRECTORY = Symbol("AP_PARTICIPANT_DIRECTORY");
export const AP_SCHEDULE_SLOT_DIRECTORY = Symbol("AP_SCHEDULE_SLOT_DIRECTORY");
export const AP_SECTION_DIRECTORY = Symbol("AP_SECTION_DIRECTORY");
export const AP_SUBJECT_DIRECTORY = Symbol("AP_SUBJECT_DIRECTORY");

// Application services.
export const AP_SESSION_SERVICE = Symbol("AP_SESSION_SERVICE");
export const AP_RECORD_SERVICE = Symbol("AP_RECORD_SERVICE");
export const AP_LEAVE_SERVICE = Symbol("AP_LEAVE_SERVICE");
export const AP_POLICY_SERVICE = Symbol("AP_POLICY_SERVICE");
export const AP_PROFILE_SERVICE = Symbol("AP_PROFILE_SERVICE");
export const AP_PARTICIPATION_SERVICE = Symbol("AP_PARTICIPATION_SERVICE");
export const AP_EVALUATION_SERVICE = Symbol("AP_EVALUATION_SERVICE");
