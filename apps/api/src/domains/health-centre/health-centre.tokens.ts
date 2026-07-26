/** Dependency-injection tokens for the Integrated Health Centre & Clinical Services Platform (P2-D19). */

// Repositories (Prisma/RLS adapters over the health-centre ports).
export const HC_CENTRE_REPOSITORY = Symbol("HC_CENTRE_REPOSITORY");
export const HC_CLINICIAN_REPOSITORY = Symbol("HC_CLINICIAN_REPOSITORY");
export const HC_APPOINTMENT_REPOSITORY = Symbol("HC_APPOINTMENT_REPOSITORY");
export const HC_ENCOUNTER_REPOSITORY = Symbol("HC_ENCOUNTER_REPOSITORY");
export const HC_PRESCRIPTION_REPOSITORY = Symbol("HC_PRESCRIPTION_REPOSITORY");
export const HC_ADMISSION_REPOSITORY = Symbol("HC_ADMISSION_REPOSITORY");
export const HC_REFERRAL_REPOSITORY = Symbol("HC_REFERRAL_REPOSITORY");
export const HC_PROFILE_REPOSITORY = Symbol("HC_PROFILE_REPOSITORY");

// Cross-domain read ports (directories over Organization P2-D01-M01, Person P2-D01-M02, Employee P2-D12).
export const HC_ORGANIZATION_DIRECTORY = Symbol("HC_ORGANIZATION_DIRECTORY");
export const HC_PERSON_DIRECTORY = Symbol("HC_PERSON_DIRECTORY");
export const HC_EMPLOYEE_DIRECTORY = Symbol("HC_EMPLOYEE_DIRECTORY");

// Application services.
export const HC_CENTRE_SERVICE = Symbol("HC_CENTRE_SERVICE");
export const HC_CLINICIAN_SERVICE = Symbol("HC_CLINICIAN_SERVICE");
export const HC_APPOINTMENT_SERVICE = Symbol("HC_APPOINTMENT_SERVICE");
export const HC_ENCOUNTER_SERVICE = Symbol("HC_ENCOUNTER_SERVICE");
export const HC_PRESCRIPTION_SERVICE = Symbol("HC_PRESCRIPTION_SERVICE");
export const HC_ADMISSION_SERVICE = Symbol("HC_ADMISSION_SERVICE");
export const HC_REFERRAL_SERVICE = Symbol("HC_REFERRAL_SERVICE");
export const HC_PROFILE_SERVICE = Symbol("HC_PROFILE_SERVICE");
