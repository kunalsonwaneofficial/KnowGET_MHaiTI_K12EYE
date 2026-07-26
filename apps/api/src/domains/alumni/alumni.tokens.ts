/** Dependency-injection tokens for the Alumni, Community & Relationship Platform (P2-D24). */

// Repositories (Prisma/RLS adapters over the alumni ports).
export const AL_PROFILE_REPOSITORY = Symbol("AL_PROFILE_REPOSITORY");
export const AL_CHAPTER_REPOSITORY = Symbol("AL_CHAPTER_REPOSITORY");
export const AL_MEMBERSHIP_REPOSITORY = Symbol("AL_MEMBERSHIP_REPOSITORY");
export const AL_EVENT_REPOSITORY = Symbol("AL_EVENT_REPOSITORY");
export const AL_REGISTRATION_REPOSITORY = Symbol("AL_REGISTRATION_REPOSITORY");
export const AL_MENTORSHIP_REPOSITORY = Symbol("AL_MENTORSHIP_REPOSITORY");
export const AL_CONTRIBUTION_REPOSITORY = Symbol("AL_CONTRIBUTION_REPOSITORY");
export const AL_ENGAGEMENT_PROFILE_REPOSITORY = Symbol("AL_ENGAGEMENT_PROFILE_REPOSITORY");

// Cross-domain read ports (directories over Organization P2-D01-M01, Person P2-D01-M02).
export const AL_ORGANIZATION_DIRECTORY = Symbol("AL_ORGANIZATION_DIRECTORY");
export const AL_PERSON_DIRECTORY = Symbol("AL_PERSON_DIRECTORY");

// Application services.
export const AL_PROFILE_SERVICE = Symbol("AL_PROFILE_SERVICE");
export const AL_CHAPTER_SERVICE = Symbol("AL_CHAPTER_SERVICE");
export const AL_MEMBERSHIP_SERVICE = Symbol("AL_MEMBERSHIP_SERVICE");
export const AL_EVENT_SERVICE = Symbol("AL_EVENT_SERVICE");
export const AL_REGISTRATION_SERVICE = Symbol("AL_REGISTRATION_SERVICE");
export const AL_MENTORSHIP_SERVICE = Symbol("AL_MENTORSHIP_SERVICE");
export const AL_CONTRIBUTION_SERVICE = Symbol("AL_CONTRIBUTION_SERVICE");
export const AL_ENGAGEMENT_PROFILE_SERVICE = Symbol("AL_ENGAGEMENT_PROFILE_SERVICE");
