/** Dependency-injection tokens for the Unified Communication, Engagement & Collaboration Platform (P2-D22). */

// Repositories (Prisma/RLS adapters over the engagement ports).
export const EN_AUDIENCE_REPOSITORY = Symbol("EN_AUDIENCE_REPOSITORY");
export const EN_ANNOUNCEMENT_REPOSITORY = Symbol("EN_ANNOUNCEMENT_REPOSITORY");
export const EN_ACKNOWLEDGEMENT_REPOSITORY = Symbol("EN_ACKNOWLEDGEMENT_REPOSITORY");
export const EN_THREAD_REPOSITORY = Symbol("EN_THREAD_REPOSITORY");
export const EN_MESSAGE_REPOSITORY = Symbol("EN_MESSAGE_REPOSITORY");
export const EN_SURVEY_REPOSITORY = Symbol("EN_SURVEY_REPOSITORY");
export const EN_RESPONSE_REPOSITORY = Symbol("EN_RESPONSE_REPOSITORY");
export const EN_PROFILE_REPOSITORY = Symbol("EN_PROFILE_REPOSITORY");

// Cross-domain read ports (directories over Organization P2-D01-M01, Person P2-D01-M02).
export const EN_ORGANIZATION_DIRECTORY = Symbol("EN_ORGANIZATION_DIRECTORY");
export const EN_PERSON_DIRECTORY = Symbol("EN_PERSON_DIRECTORY");

// Application services.
export const EN_AUDIENCE_SERVICE = Symbol("EN_AUDIENCE_SERVICE");
export const EN_ANNOUNCEMENT_SERVICE = Symbol("EN_ANNOUNCEMENT_SERVICE");
export const EN_ACKNOWLEDGEMENT_SERVICE = Symbol("EN_ACKNOWLEDGEMENT_SERVICE");
export const EN_THREAD_SERVICE = Symbol("EN_THREAD_SERVICE");
export const EN_MESSAGE_SERVICE = Symbol("EN_MESSAGE_SERVICE");
export const EN_SURVEY_SERVICE = Symbol("EN_SURVEY_SERVICE");
export const EN_RESPONSE_SERVICE = Symbol("EN_RESPONSE_SERVICE");
export const EN_PROFILE_SERVICE = Symbol("EN_PROFILE_SERVICE");
