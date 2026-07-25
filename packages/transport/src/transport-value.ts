/** The kind of vehicle in the fleet. */
export const VEHICLE_TYPES = ["bus", "minibus", "van", "car"] as const;

export type VehicleType = (typeof VEHICLE_TYPES)[number];

/** How a vehicle is held — owned outright by the institution, or contracted/hired from an operator. */
export const VEHICLE_OWNERSHIPS = ["owned", "contracted"] as const;

export type VehicleOwnership = (typeof VEHICLE_OWNERSHIPS)[number];

/** Lifecycle of a fleet vehicle — active (operable), under maintenance, or retired (terminal). */
export const VEHICLE_STATUSES = ["active", "under_maintenance", "retired"] as const;

export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

/** Lifecycle of a driver — active, temporarily suspended, or permanently deactivated (terminal). */
export const DRIVER_STATUSES = ["active", "suspended", "deactivated"] as const;

export type DriverStatus = (typeof DRIVER_STATUSES)[number];

/** The direction a route serves — the morning `pickup`, the afternoon `drop`, or `both`. */
export const ROUTE_DIRECTIONS = ["pickup", "drop", "both"] as const;

export type RouteDirection = (typeof ROUTE_DIRECTIONS)[number];

/**
 * Lifecycle of a route: `draft` (stops editable) → `active` (published, stops frozen) → `suspended`
 * (temporarily off) → `retired` (terminal).
 */
export const ROUTE_STATUSES = ["draft", "active", "suspended", "retired"] as const;

export type RouteStatus = (typeof ROUTE_STATUSES)[number];

/** Lifecycle of a vehicle→route assignment — currently active, or ended (terminal). */
export const ASSIGNMENT_STATUSES = ["active", "ended"] as const;

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

/**
 * Lifecycle of a student's transport subscription: `requested` → `active` (riding) → `suspended`
 * (temporarily off) → `ended` (terminal).
 */
export const SUBSCRIPTION_STATUSES = ["requested", "active", "suspended", "ended"] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * Lifecycle of a trip (a run of a route on a service date): `scheduled` → `in_progress` (boarding
 * recorded) → `completed`, or `cancelled`.
 */
export const TRIP_STATUSES = ["scheduled", "in_progress", "completed", "cancelled"] as const;

export type TripStatus = (typeof TRIP_STATUSES)[number];

/** The trip statuses on which boarding/alighting can be recorded. */
export const BOARDABLE_TRIP_STATUSES: readonly TripStatus[] = ["in_progress"];

/** A boarding event on a trip — a student `boarded` (got on) or `alighted` (got off) at a stop. */
export const TRIP_EVENT_TYPES = ["boarded", "alighted"] as const;

export type TripEventType = (typeof TRIP_EVENT_TYPES)[number];

/** The kind of statutory vehicle document tracked for compliance. */
export const DOCUMENT_TYPES = ["insurance", "fitness", "permit", "pollution", "road_tax"] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/**
 * The derived compliance status of a document as of a date — `valid`, `expiring` (within the warning
 * window), or `expired`. Computed from the expiry date, never stored as authoritative state.
 */
export const COMPLIANCE_STATUSES = ["valid", "expiring", "expired"] as const;

export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];
