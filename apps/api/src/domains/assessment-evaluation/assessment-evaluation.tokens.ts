/** Dependency-injection tokens for the Assessment & Evaluation Platform (P2-D10). */

// Repositories (Prisma/RLS adapters over the assessment-evaluation ports).
export const AE_FRAMEWORK_REPOSITORY = Symbol("AE_FRAMEWORK_REPOSITORY");
export const AE_PLAN_REPOSITORY = Symbol("AE_PLAN_REPOSITORY");
export const AE_ASSESSMENT_REPOSITORY = Symbol("AE_ASSESSMENT_REPOSITORY");
export const AE_QUESTION_BANK_REPOSITORY = Symbol("AE_QUESTION_BANK_REPOSITORY");
export const AE_EVALUATION_REPOSITORY = Symbol("AE_EVALUATION_REPOSITORY");
export const AE_COMPETENCY_PROFILE_REPOSITORY = Symbol("AE_COMPETENCY_PROFILE_REPOSITORY");
export const AE_ACADEMIC_RECORD_REPOSITORY = Symbol("AE_ACADEMIC_RECORD_REPOSITORY");

// Cross-domain read ports (directories over Organization, Academic-Structure, Student-Lifecycle).
export const AE_ORGANIZATION_DIRECTORY = Symbol("AE_ORGANIZATION_DIRECTORY");
export const AE_SUBJECT_DIRECTORY = Symbol("AE_SUBJECT_DIRECTORY");
export const AE_STUDENT_DIRECTORY = Symbol("AE_STUDENT_DIRECTORY");

// Application services.
export const AE_FRAMEWORK_SERVICE = Symbol("AE_FRAMEWORK_SERVICE");
export const AE_PLAN_SERVICE = Symbol("AE_PLAN_SERVICE");
export const AE_ASSESSMENT_SERVICE = Symbol("AE_ASSESSMENT_SERVICE");
export const AE_QUESTION_BANK_SERVICE = Symbol("AE_QUESTION_BANK_SERVICE");
export const AE_EVALUATION_SERVICE = Symbol("AE_EVALUATION_SERVICE");
export const AE_COMPETENCY_PROFILE_SERVICE = Symbol("AE_COMPETENCY_PROFILE_SERVICE");
export const AE_ACADEMIC_RECORD_SERVICE = Symbol("AE_ACADEMIC_RECORD_SERVICE");
export const AE_REPORTING_SERVICE = Symbol("AE_REPORTING_SERVICE");
export const AE_ANALYTICS_SERVICE = Symbol("AE_ANALYTICS_SERVICE");
