/** Dependency-injection tokens for the Admissions, Marketing, Enrollment & Growth Platform (P2-D23). */

// Repositories (Prisma/RLS adapters over the admissions ports).
export const AD_CAMPAIGN_REPOSITORY = Symbol("AD_CAMPAIGN_REPOSITORY");
export const AD_LEAD_REPOSITORY = Symbol("AD_LEAD_REPOSITORY");
export const AD_CYCLE_REPOSITORY = Symbol("AD_CYCLE_REPOSITORY");
export const AD_APPLICATION_REPOSITORY = Symbol("AD_APPLICATION_REPOSITORY");
export const AD_EVALUATION_REPOSITORY = Symbol("AD_EVALUATION_REPOSITORY");
export const AD_OFFER_REPOSITORY = Symbol("AD_OFFER_REPOSITORY");
export const AD_ENROLLMENT_REPOSITORY = Symbol("AD_ENROLLMENT_REPOSITORY");
export const AD_PROFILE_REPOSITORY = Symbol("AD_PROFILE_REPOSITORY");

// Cross-domain read ports (directories over Organization P2-D01-M01, Person P2-D01-M02).
export const AD_ORGANIZATION_DIRECTORY = Symbol("AD_ORGANIZATION_DIRECTORY");
export const AD_PERSON_DIRECTORY = Symbol("AD_PERSON_DIRECTORY");

// Application services.
export const AD_CAMPAIGN_SERVICE = Symbol("AD_CAMPAIGN_SERVICE");
export const AD_LEAD_SERVICE = Symbol("AD_LEAD_SERVICE");
export const AD_CYCLE_SERVICE = Symbol("AD_CYCLE_SERVICE");
export const AD_APPLICATION_SERVICE = Symbol("AD_APPLICATION_SERVICE");
export const AD_EVALUATION_SERVICE = Symbol("AD_EVALUATION_SERVICE");
export const AD_OFFER_SERVICE = Symbol("AD_OFFER_SERVICE");
export const AD_ENROLLMENT_SERVICE = Symbol("AD_ENROLLMENT_SERVICE");
export const AD_PROFILE_SERVICE = Symbol("AD_PROFILE_SERVICE");
