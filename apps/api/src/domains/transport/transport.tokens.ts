/** Dependency-injection tokens for the Smart Mobility, Transport & Fleet Platform (P2-D16). */

// Repositories (Prisma/RLS adapters over the transport ports).
export const TR_VEHICLE_REPOSITORY = Symbol("TR_VEHICLE_REPOSITORY");
export const TR_DRIVER_REPOSITORY = Symbol("TR_DRIVER_REPOSITORY");
export const TR_ROUTE_REPOSITORY = Symbol("TR_ROUTE_REPOSITORY");
export const TR_ASSIGNMENT_REPOSITORY = Symbol("TR_ASSIGNMENT_REPOSITORY");
export const TR_SUBSCRIPTION_REPOSITORY = Symbol("TR_SUBSCRIPTION_REPOSITORY");
export const TR_TRIP_REPOSITORY = Symbol("TR_TRIP_REPOSITORY");
export const TR_DOCUMENT_REPOSITORY = Symbol("TR_DOCUMENT_REPOSITORY");
export const TR_UTILIZATION_REPOSITORY = Symbol("TR_UTILIZATION_REPOSITORY");

// Cross-domain read ports (directories over Organization, Workforce Employee, Student).
export const TR_ORGANIZATION_DIRECTORY = Symbol("TR_ORGANIZATION_DIRECTORY");
export const TR_EMPLOYEE_DIRECTORY = Symbol("TR_EMPLOYEE_DIRECTORY");
export const TR_STUDENT_DIRECTORY = Symbol("TR_STUDENT_DIRECTORY");

// Application services.
export const TR_VEHICLE_SERVICE = Symbol("TR_VEHICLE_SERVICE");
export const TR_DRIVER_SERVICE = Symbol("TR_DRIVER_SERVICE");
export const TR_ROUTE_SERVICE = Symbol("TR_ROUTE_SERVICE");
export const TR_ASSIGNMENT_SERVICE = Symbol("TR_ASSIGNMENT_SERVICE");
export const TR_SUBSCRIPTION_SERVICE = Symbol("TR_SUBSCRIPTION_SERVICE");
export const TR_TRIP_SERVICE = Symbol("TR_TRIP_SERVICE");
export const TR_DOCUMENT_SERVICE = Symbol("TR_DOCUMENT_SERVICE");
export const TR_UTILIZATION_SERVICE = Symbol("TR_UTILIZATION_SERVICE");
