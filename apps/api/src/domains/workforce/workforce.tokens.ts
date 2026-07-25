/** Dependency-injection tokens for the Workforce & Human Capital Platform (P2-D12). */

// Repositories (Prisma/RLS adapters over the workforce ports).
export const WF_DEPARTMENT_REPOSITORY = Symbol("WF_DEPARTMENT_REPOSITORY");
export const WF_POSITION_REPOSITORY = Symbol("WF_POSITION_REPOSITORY");
export const WF_EMPLOYEE_REPOSITORY = Symbol("WF_EMPLOYEE_REPOSITORY");
export const WF_CONTRACT_REPOSITORY = Symbol("WF_CONTRACT_REPOSITORY");
export const WF_LEAVE_ENTITLEMENT_REPOSITORY = Symbol("WF_LEAVE_ENTITLEMENT_REPOSITORY");
export const WF_LEAVE_REQUEST_REPOSITORY = Symbol("WF_LEAVE_REQUEST_REPOSITORY");
export const WF_REVIEW_REPOSITORY = Symbol("WF_REVIEW_REPOSITORY");
export const WF_PROFILE_REPOSITORY = Symbol("WF_PROFILE_REPOSITORY");

// Cross-domain read ports (directories over Organization, Person).
export const WF_ORGANIZATION_DIRECTORY = Symbol("WF_ORGANIZATION_DIRECTORY");
export const WF_PERSON_DIRECTORY = Symbol("WF_PERSON_DIRECTORY");

// Application services.
export const WF_DEPARTMENT_SERVICE = Symbol("WF_DEPARTMENT_SERVICE");
export const WF_POSITION_SERVICE = Symbol("WF_POSITION_SERVICE");
export const WF_EMPLOYEE_SERVICE = Symbol("WF_EMPLOYEE_SERVICE");
export const WF_CONTRACT_SERVICE = Symbol("WF_CONTRACT_SERVICE");
export const WF_LEAVE_SERVICE = Symbol("WF_LEAVE_SERVICE");
export const WF_REVIEW_SERVICE = Symbol("WF_REVIEW_SERVICE");
export const WF_PROFILE_SERVICE = Symbol("WF_PROFILE_SERVICE");
