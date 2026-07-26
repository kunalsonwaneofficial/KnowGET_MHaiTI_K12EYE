/** Dependency-injection tokens for the Campus Security, Safety & Visitor Platform (P2-D21). */

// Repositories (Prisma/RLS adapters over the campus-security ports).
export const CS_ZONE_REPOSITORY = Symbol("CS_ZONE_REPOSITORY");
export const CS_VISITOR_REPOSITORY = Symbol("CS_VISITOR_REPOSITORY");
export const CS_VISIT_REPOSITORY = Symbol("CS_VISIT_REPOSITORY");
export const CS_CREDENTIAL_REPOSITORY = Symbol("CS_CREDENTIAL_REPOSITORY");
export const CS_ACCESS_EVENT_REPOSITORY = Symbol("CS_ACCESS_EVENT_REPOSITORY");
export const CS_INCIDENT_REPOSITORY = Symbol("CS_INCIDENT_REPOSITORY");
export const CS_DRILL_REPOSITORY = Symbol("CS_DRILL_REPOSITORY");
export const CS_PROFILE_REPOSITORY = Symbol("CS_PROFILE_REPOSITORY");

// Cross-domain read ports (directories over Organization P2-D01-M01, Person P2-D01-M02, Employee P2-D12).
export const CS_ORGANIZATION_DIRECTORY = Symbol("CS_ORGANIZATION_DIRECTORY");
export const CS_PERSON_DIRECTORY = Symbol("CS_PERSON_DIRECTORY");
export const CS_EMPLOYEE_DIRECTORY = Symbol("CS_EMPLOYEE_DIRECTORY");

// Application services.
export const CS_ZONE_SERVICE = Symbol("CS_ZONE_SERVICE");
export const CS_VISITOR_SERVICE = Symbol("CS_VISITOR_SERVICE");
export const CS_VISIT_SERVICE = Symbol("CS_VISIT_SERVICE");
export const CS_CREDENTIAL_SERVICE = Symbol("CS_CREDENTIAL_SERVICE");
export const CS_ACCESS_EVENT_SERVICE = Symbol("CS_ACCESS_EVENT_SERVICE");
export const CS_INCIDENT_SERVICE = Symbol("CS_INCIDENT_SERVICE");
export const CS_DRILL_SERVICE = Symbol("CS_DRILL_SERVICE");
export const CS_PROFILE_SERVICE = Symbol("CS_PROFILE_SERVICE");
export const CS_ACCESS_DECISION_SERVICE = Symbol("CS_ACCESS_DECISION_SERVICE");
