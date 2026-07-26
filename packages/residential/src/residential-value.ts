/** The kind of hostel by the residents it houses. */
export const HOSTEL_TYPES = ["boys", "girls", "mixed"] as const;

export type HostelType = (typeof HOSTEL_TYPES)[number];

/** Lifecycle of a hostel — active (in service), under maintenance, or decommissioned (terminal). */
export const HOSTEL_STATUSES = ["active", "under_maintenance", "decommissioned"] as const;

export type HostelStatus = (typeof HOSTEL_STATUSES)[number];

/** The supervisory role a warden holds within residential life. */
export const WARDEN_ROLES = ["chief_warden", "warden", "assistant_warden"] as const;

export type WardenRole = (typeof WARDEN_ROLES)[number];

/** Lifecycle of a warden — active, temporarily suspended, or relieved of duty (terminal). */
export const WARDEN_STATUSES = ["active", "suspended", "relieved"] as const;

export type WardenStatus = (typeof WARDEN_STATUSES)[number];

/** The kind of room by its bed configuration. */
export const ROOM_TYPES = ["single", "double", "triple", "dormitory"] as const;

export type RoomType = (typeof ROOM_TYPES)[number];

/**
 * Lifecycle of a room: `draft` (beds editable) → `available` (published, beds frozen, allocatable) ↔
 * `under_maintenance` (temporarily off) → `decommissioned` (terminal).
 */
export const ROOM_STATUSES = ["draft", "available", "under_maintenance", "decommissioned"] as const;

export type RoomStatus = (typeof ROOM_STATUSES)[number];

/** Lifecycle of a bed allocation (a student's residency in a bed) — active, or ended (terminal). */
export const ALLOCATION_STATUSES = ["active", "ended"] as const;

export type AllocationStatus = (typeof ALLOCATION_STATUSES)[number];

/** The kind of outpass (gate pass) a resident is granted to leave and return. */
export const OUTPASS_TYPES = ["day", "overnight", "weekend", "home", "emergency"] as const;

export type OutpassType = (typeof OUTPASS_TYPES)[number];

/**
 * Lifecycle of an outpass: `requested` → `approved` → `checked_out` (resident has left) → `returned`
 * (resident is back), or `rejected` / `cancelled` (terminal ends without a trip out).
 */
export const OUTPASS_STATUSES = [
  "requested",
  "approved",
  "rejected",
  "checked_out",
  "returned",
  "cancelled",
] as const;

export type OutpassStatus = (typeof OUTPASS_STATUSES)[number];

/** The outpass statuses that are still open — a resident may hold only one open outpass at a time. */
export const OPEN_OUTPASS_STATUSES: readonly OutpassStatus[] = [
  "requested",
  "approved",
  "checked_out",
];

/**
 * Lifecycle of a roll call (a curfew presence check): `scheduled` → `in_progress` (residents being
 * marked) → `completed`, or `cancelled`.
 */
export const ROLL_CALL_STATUSES = ["scheduled", "in_progress", "completed", "cancelled"] as const;

export type RollCallStatus = (typeof ROLL_CALL_STATUSES)[number];

/** The roll-call statuses on which residents can be marked. */
export const MARKABLE_ROLL_CALL_STATUSES: readonly RollCallStatus[] = ["in_progress"];

/** How a resident is marked at a roll call — present, late, on approved leave, or absent (unaccounted). */
export const PRESENCE_MARKS = ["present", "late", "on_leave", "absent"] as const;

export type PresenceMark = (typeof PRESENCE_MARKS)[number];

/** The kind of statutory hostel inspection tracked for compliance. */
export const INSPECTION_TYPES = [
  "fire_safety",
  "hygiene",
  "electrical",
  "structural",
  "security",
] as const;

export type InspectionType = (typeof INSPECTION_TYPES)[number];

/** The recorded outcome of a hostel inspection. */
export const INSPECTION_OUTCOMES = ["compliant", "action_required", "non_compliant"] as const;

export type InspectionOutcome = (typeof INSPECTION_OUTCOMES)[number];

/**
 * The derived compliance status of an inspection as of a date — `valid`, `due_soon` (the next
 * inspection falls within the warning window), or `overdue` (the next-due date has passed). Computed
 * from the next-due date, never stored as authoritative state.
 */
export const COMPLIANCE_STATUSES = ["valid", "due_soon", "overdue"] as const;

export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];
