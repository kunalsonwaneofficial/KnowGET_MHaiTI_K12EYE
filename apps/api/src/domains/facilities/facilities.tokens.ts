/** Dependency-injection tokens for the Campus Infrastructure, Facilities & Smart Environment Platform (P2-D20). */

// Repositories (Prisma/RLS adapters over the facilities ports).
export const FAC_BUILDING_REPOSITORY = Symbol("FAC_BUILDING_REPOSITORY");
export const FAC_SPACE_REPOSITORY = Symbol("FAC_SPACE_REPOSITORY");
export const FAC_SYSTEM_REPOSITORY = Symbol("FAC_SYSTEM_REPOSITORY");
export const FAC_SENSOR_REPOSITORY = Symbol("FAC_SENSOR_REPOSITORY");
export const FAC_READING_REPOSITORY = Symbol("FAC_READING_REPOSITORY");
export const FAC_MAINTENANCE_REPOSITORY = Symbol("FAC_MAINTENANCE_REPOSITORY");
export const FAC_POLICY_REPOSITORY = Symbol("FAC_POLICY_REPOSITORY");
export const FAC_PROFILE_REPOSITORY = Symbol("FAC_PROFILE_REPOSITORY");

// Cross-domain read ports (directories over Organization P2-D01-M01 and Employee P2-D12).
export const FAC_ORGANIZATION_DIRECTORY = Symbol("FAC_ORGANIZATION_DIRECTORY");
export const FAC_EMPLOYEE_DIRECTORY = Symbol("FAC_EMPLOYEE_DIRECTORY");

// Application services.
export const FAC_BUILDING_SERVICE = Symbol("FAC_BUILDING_SERVICE");
export const FAC_SPACE_SERVICE = Symbol("FAC_SPACE_SERVICE");
export const FAC_SYSTEM_SERVICE = Symbol("FAC_SYSTEM_SERVICE");
export const FAC_SENSOR_SERVICE = Symbol("FAC_SENSOR_SERVICE");
export const FAC_READING_SERVICE = Symbol("FAC_READING_SERVICE");
export const FAC_MAINTENANCE_SERVICE = Symbol("FAC_MAINTENANCE_SERVICE");
export const FAC_POLICY_SERVICE = Symbol("FAC_POLICY_SERVICE");
export const FAC_PROFILE_SERVICE = Symbol("FAC_PROFILE_SERVICE");
export const FAC_COMFORT_ASSESSMENT_SERVICE = Symbol("FAC_COMFORT_ASSESSMENT_SERVICE");
