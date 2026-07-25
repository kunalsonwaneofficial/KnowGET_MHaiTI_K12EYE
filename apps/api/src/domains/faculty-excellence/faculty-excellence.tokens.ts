/** Dependency-injection tokens for the Faculty Excellence, Coaching & Professional Growth Platform (P2-D13). */

// Repositories (Prisma/RLS adapters over the faculty-excellence ports).
export const FE_FRAMEWORK_REPOSITORY = Symbol("FE_FRAMEWORK_REPOSITORY");
export const FE_OBSERVATION_REPOSITORY = Symbol("FE_OBSERVATION_REPOSITORY");
export const FE_ENGAGEMENT_REPOSITORY = Symbol("FE_ENGAGEMENT_REPOSITORY");
export const FE_SESSION_REPOSITORY = Symbol("FE_SESSION_REPOSITORY");
export const FE_REQUIREMENT_REPOSITORY = Symbol("FE_REQUIREMENT_REPOSITORY");
export const FE_ACTIVITY_REPOSITORY = Symbol("FE_ACTIVITY_REPOSITORY");
export const FE_GOAL_REPOSITORY = Symbol("FE_GOAL_REPOSITORY");
export const FE_PROFILE_REPOSITORY = Symbol("FE_PROFILE_REPOSITORY");

// Cross-domain read ports (directories over Organization, Workforce Employee).
export const FE_ORGANIZATION_DIRECTORY = Symbol("FE_ORGANIZATION_DIRECTORY");
export const FE_EMPLOYEE_DIRECTORY = Symbol("FE_EMPLOYEE_DIRECTORY");

// Application services.
export const FE_FRAMEWORK_SERVICE = Symbol("FE_FRAMEWORK_SERVICE");
export const FE_OBSERVATION_SERVICE = Symbol("FE_OBSERVATION_SERVICE");
export const FE_ENGAGEMENT_SERVICE = Symbol("FE_ENGAGEMENT_SERVICE");
export const FE_SESSION_SERVICE = Symbol("FE_SESSION_SERVICE");
export const FE_DEVELOPMENT_SERVICE = Symbol("FE_DEVELOPMENT_SERVICE");
export const FE_GOAL_SERVICE = Symbol("FE_GOAL_SERVICE");
export const FE_PROFILE_SERVICE = Symbol("FE_PROFILE_SERVICE");
