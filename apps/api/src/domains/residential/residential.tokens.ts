/** Dependency-injection tokens for the Residential Life, Hostel & Boarding Platform (P2-D17). */

// Repositories (Prisma/RLS adapters over the residential ports).
export const RS_HOSTEL_REPOSITORY = Symbol("RS_HOSTEL_REPOSITORY");
export const RS_WARDEN_REPOSITORY = Symbol("RS_WARDEN_REPOSITORY");
export const RS_ROOM_REPOSITORY = Symbol("RS_ROOM_REPOSITORY");
export const RS_ALLOCATION_REPOSITORY = Symbol("RS_ALLOCATION_REPOSITORY");
export const RS_OUTPASS_REPOSITORY = Symbol("RS_OUTPASS_REPOSITORY");
export const RS_ROLL_CALL_REPOSITORY = Symbol("RS_ROLL_CALL_REPOSITORY");
export const RS_INSPECTION_REPOSITORY = Symbol("RS_INSPECTION_REPOSITORY");
export const RS_OCCUPANCY_REPOSITORY = Symbol("RS_OCCUPANCY_REPOSITORY");

// Cross-domain read ports (directories over Organization, Workforce Employee, Student).
export const RS_ORGANIZATION_DIRECTORY = Symbol("RS_ORGANIZATION_DIRECTORY");
export const RS_EMPLOYEE_DIRECTORY = Symbol("RS_EMPLOYEE_DIRECTORY");
export const RS_STUDENT_DIRECTORY = Symbol("RS_STUDENT_DIRECTORY");

// Application services.
export const RS_HOSTEL_SERVICE = Symbol("RS_HOSTEL_SERVICE");
export const RS_WARDEN_SERVICE = Symbol("RS_WARDEN_SERVICE");
export const RS_ROOM_SERVICE = Symbol("RS_ROOM_SERVICE");
export const RS_ALLOCATION_SERVICE = Symbol("RS_ALLOCATION_SERVICE");
export const RS_OUTPASS_SERVICE = Symbol("RS_OUTPASS_SERVICE");
export const RS_ROLL_CALL_SERVICE = Symbol("RS_ROLL_CALL_SERVICE");
export const RS_INSPECTION_SERVICE = Symbol("RS_INSPECTION_SERVICE");
export const RS_OCCUPANCY_SERVICE = Symbol("RS_OCCUPANCY_SERVICE");
