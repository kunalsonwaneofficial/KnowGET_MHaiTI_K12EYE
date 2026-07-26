/** Dependency-injection tokens for the Knowledge Resource, Library & Digital Learning Asset Platform (P2-D18). */

// Repositories (Prisma/RLS adapters over the library ports).
export const LB_TITLE_REPOSITORY = Symbol("LB_TITLE_REPOSITORY");
export const LB_COPY_REPOSITORY = Symbol("LB_COPY_REPOSITORY");
export const LB_DIGITAL_ASSET_REPOSITORY = Symbol("LB_DIGITAL_ASSET_REPOSITORY");
export const LB_MEMBER_REPOSITORY = Symbol("LB_MEMBER_REPOSITORY");
export const LB_LOAN_REPOSITORY = Symbol("LB_LOAN_REPOSITORY");
export const LB_RESERVATION_REPOSITORY = Symbol("LB_RESERVATION_REPOSITORY");
export const LB_POLICY_REPOSITORY = Symbol("LB_POLICY_REPOSITORY");
export const LB_PROFILE_REPOSITORY = Symbol("LB_PROFILE_REPOSITORY");

// Cross-domain read ports (directories over Organization P2-D01-M01 and Person P2-D01-M02).
export const LB_ORGANIZATION_DIRECTORY = Symbol("LB_ORGANIZATION_DIRECTORY");
export const LB_PERSON_DIRECTORY = Symbol("LB_PERSON_DIRECTORY");

// Application services.
export const LB_TITLE_SERVICE = Symbol("LB_TITLE_SERVICE");
export const LB_COPY_SERVICE = Symbol("LB_COPY_SERVICE");
export const LB_DIGITAL_ASSET_SERVICE = Symbol("LB_DIGITAL_ASSET_SERVICE");
export const LB_MEMBER_SERVICE = Symbol("LB_MEMBER_SERVICE");
export const LB_LOAN_SERVICE = Symbol("LB_LOAN_SERVICE");
export const LB_RESERVATION_SERVICE = Symbol("LB_RESERVATION_SERVICE");
export const LB_POLICY_SERVICE = Symbol("LB_POLICY_SERVICE");
export const LB_PROFILE_SERVICE = Symbol("LB_PROFILE_SERVICE");
