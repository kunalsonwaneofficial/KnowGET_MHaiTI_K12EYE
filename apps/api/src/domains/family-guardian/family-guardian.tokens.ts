/** Dependency-injection tokens for the Family & Guardian Intelligence Platform (P2-D04). */

// Repositories (Prisma/RLS adapters over the family-guardian ports).
export const FAMILY_REPOSITORY = Symbol("FAMILY_REPOSITORY");
export const GUARDIAN_REPOSITORY = Symbol("GUARDIAN_REPOSITORY");
export const FG_RELATIONSHIP_REPOSITORY = Symbol("FG_RELATIONSHIP_REPOSITORY");
export const FG_CONSENT_REPOSITORY = Symbol("FG_CONSENT_REPOSITORY");
export const FG_EMERGENCY_CONTACT_REPOSITORY = Symbol("FG_EMERGENCY_CONTACT_REPOSITORY");
export const FG_COMMUNICATION_PROFILE_REPOSITORY = Symbol("FG_COMMUNICATION_PROFILE_REPOSITORY");
export const FG_INTELLIGENCE_PROFILE_REPOSITORY = Symbol("FG_INTELLIGENCE_PROFILE_REPOSITORY");

// Cross-domain read ports (directories over Person / Organization / Student / Policy).
export const FG_PERSON_DIRECTORY = Symbol("FG_PERSON_DIRECTORY");
export const FG_ORGANIZATION_DIRECTORY = Symbol("FG_ORGANIZATION_DIRECTORY");
export const FG_STUDENT_DIRECTORY = Symbol("FG_STUDENT_DIRECTORY");
export const FG_POLICY_DIRECTORY = Symbol("FG_POLICY_DIRECTORY");

// Application services.
export const FAMILY_SERVICE = Symbol("FAMILY_SERVICE");
export const GUARDIAN_SERVICE = Symbol("GUARDIAN_SERVICE");
export const FG_RELATIONSHIP_SERVICE = Symbol("FG_RELATIONSHIP_SERVICE");
export const FG_CONSENT_SERVICE = Symbol("FG_CONSENT_SERVICE");
export const FG_EMERGENCY_CONTACT_SERVICE = Symbol("FG_EMERGENCY_CONTACT_SERVICE");
export const FG_COMMUNICATION_PROFILE_SERVICE = Symbol("FG_COMMUNICATION_PROFILE_SERVICE");
export const FG_INTELLIGENCE_PROFILE_SERVICE = Symbol("FG_INTELLIGENCE_PROFILE_SERVICE");
