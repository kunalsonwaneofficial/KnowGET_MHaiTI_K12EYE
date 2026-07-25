/** Dependency-injection tokens for the Learning Intelligence & Educational Insights Platform (P2-D11). */

// Repositories (Prisma/RLS adapters over the learning-intelligence ports).
export const LI_SIGNAL_REPOSITORY = Symbol("LI_SIGNAL_REPOSITORY");
export const LI_PROFILE_REPOSITORY = Symbol("LI_PROFILE_REPOSITORY");
export const LI_EARLY_WARNING_REPOSITORY = Symbol("LI_EARLY_WARNING_REPOSITORY");
export const LI_INSIGHT_REPOSITORY = Symbol("LI_INSIGHT_REPOSITORY");
export const LI_RECOMMENDATION_REPOSITORY = Symbol("LI_RECOMMENDATION_REPOSITORY");
export const LI_GROWTH_PLAN_REPOSITORY = Symbol("LI_GROWTH_PLAN_REPOSITORY");
export const LI_COHORT_REPOSITORY = Symbol("LI_COHORT_REPOSITORY");

// Cross-domain read ports (directories over Organization, Student-Lifecycle).
export const LI_ORGANIZATION_DIRECTORY = Symbol("LI_ORGANIZATION_DIRECTORY");
export const LI_STUDENT_DIRECTORY = Symbol("LI_STUDENT_DIRECTORY");

// Application services.
export const LI_SIGNAL_SERVICE = Symbol("LI_SIGNAL_SERVICE");
export const LI_PROFILE_SERVICE = Symbol("LI_PROFILE_SERVICE");
export const LI_EARLY_WARNING_SERVICE = Symbol("LI_EARLY_WARNING_SERVICE");
export const LI_INSIGHT_SERVICE = Symbol("LI_INSIGHT_SERVICE");
export const LI_RECOMMENDATION_SERVICE = Symbol("LI_RECOMMENDATION_SERVICE");
export const LI_GROWTH_PLAN_SERVICE = Symbol("LI_GROWTH_PLAN_SERVICE");
export const LI_COHORT_SERVICE = Symbol("LI_COHORT_SERVICE");
