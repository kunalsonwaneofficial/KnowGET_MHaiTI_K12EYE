/**
 * Value objects for the Campus Infrastructure, Facilities & Smart Environment Platform (P2-D20). Every set
 * is a closed string-literal union backed by a `readonly` tuple, so the domain, the DTOs and the database
 * agree on the same vocabulary. Nothing here is money — the movable/capitalized asset register and its
 * costed maintenance are Procurement & Assets' (P2-D15), and utility billing is Finance's (P2-D14).
 */

/** The kind of building on the campus. */
export const BUILDING_TYPES = [
  "academic",
  "administrative",
  "laboratory",
  "sports",
  "library",
  "utility",
  "multipurpose",
] as const;
export type BuildingType = (typeof BUILDING_TYPES)[number];

/** A building's lifecycle — operational, temporarily under renovation, or permanently retired. */
export const BUILDING_STATUSES = ["active", "under_renovation", "decommissioned"] as const;
export type BuildingStatus = (typeof BUILDING_STATUSES)[number];

/** The kind of space within a building. */
export const SPACE_TYPES = [
  "classroom",
  "laboratory",
  "office",
  "hall",
  "storage",
  "restroom",
  "common",
] as const;
export type SpaceType = (typeof SPACE_TYPES)[number];

/** A space's lifecycle — set up as draft, then available for use, taken out of service, or retired. */
export const SPACE_STATUSES = ["draft", "available", "out_of_service", "decommissioned"] as const;
export type SpaceStatus = (typeof SPACE_STATUSES)[number];

/** The kind of fixed infrastructure system serving a building. */
export const SYSTEM_TYPES = [
  "hvac",
  "electrical",
  "plumbing",
  "elevator",
  "fire_safety",
  "network",
  "water",
] as const;
export type SystemType = (typeof SYSTEM_TYPES)[number];

/** A facility system's lifecycle. */
export const SYSTEM_STATUSES = ["operational", "under_maintenance", "decommissioned"] as const;
export type SystemStatus = (typeof SYSTEM_STATUSES)[number];

/** A facility system's derived service status against its next-due date. */
export const SERVICE_STATUSES = ["ok", "due_soon", "overdue"] as const;
export type ServiceStatusBand = (typeof SERVICE_STATUSES)[number];

/** The physical metric a smart-environment sensor reads. */
export const SENSOR_METRICS = [
  "temperature",
  "humidity",
  "co2",
  "occupancy",
  "energy",
  "water",
] as const;
export type SensorMetric = (typeof SENSOR_METRICS)[number];

/** A sensor's lifecycle — active, temporarily inactive, or retired. */
export const SENSOR_STATUSES = ["active", "inactive", "retired"] as const;
export type SensorStatus = (typeof SENSOR_STATUSES)[number];

/** The category of a facilities work order. */
export const MAINTENANCE_CATEGORIES = [
  "repair",
  "inspection",
  "cleaning",
  "upgrade",
  "safety",
] as const;
export type MaintenanceCategory = (typeof MAINTENANCE_CATEGORIES)[number];

/** A work order's priority. */
export const MAINTENANCE_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type MaintenancePriority = (typeof MAINTENANCE_PRIORITIES)[number];

/** A work order's lifecycle. */
export const MAINTENANCE_STATUSES = [
  "reported",
  "assigned",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

/** The non-terminal maintenance statuses — an "open" work order still on the books. */
export const OPEN_MAINTENANCE_STATUSES = ["reported", "assigned", "in_progress"] as const;

/** A comfort policy's lifecycle. */
export const POLICY_STATUSES = ["draft", "active", "archived"] as const;
export type PolicyStatus = (typeof POLICY_STATUSES)[number];

/** The derived comfort band for a space's environment. */
export const COMFORT_BANDS = ["comfortable", "marginal", "poor"] as const;
export type ComfortBand = (typeof COMFORT_BANDS)[number];
