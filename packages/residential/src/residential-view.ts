import type {
  ComplianceStatus,
  InspectionOutcome,
  InspectionType,
  PresenceMark,
} from "./residential-value";

/**
 * The narrow views the pure engines consume. The aggregates structurally satisfy them, so the engines
 * depend on no aggregate — the same pure-engine-over-views pattern used across P2-D07…D16.
 */

// --- Occupancy engine ------------------------------------------------------------

/** The minimal view of a room's occupancy the hostel rollup needs. */
export interface RoomOccupancyMemberView {
  readonly bedCount: number;
  readonly occupantCount: number;
  readonly overCapacity: boolean;
}

/**
 * A room's occupancy — its bed count against its active occupants: the beds still available (may be
 * negative if over-allocated), the occupancy percent, and whether it is over capacity. Descriptive and
 * exact.
 */
export interface RoomOccupancy {
  readonly bedCount: number;
  readonly occupantCount: number;
  readonly bedsAvailable: number;
  readonly occupancyPercent: number;
  readonly overCapacity: boolean;
}

/** A hostel's occupancy — rolled up across its rooms. Descriptive and exact. */
export interface HostelOccupancy {
  readonly roomCount: number;
  readonly bedCount: number;
  readonly occupantCount: number;
  readonly bedsAvailable: number;
  readonly occupancyPercent: number;
  readonly overCapacityRoomCount: number;
}

/** The minimal view of a hostel's occupancy the institution rollup needs. */
export interface HostelOccupancyMemberView {
  readonly bedCount: number;
  readonly occupantCount: number;
  readonly overCapacity: boolean;
}

/**
 * A leadership-facing rollup of an institution's hostels — hostel count, total beds and occupants, beds
 * available, and the count of over-capacity hostels. Descriptive only.
 */
export interface ResidenceOccupancySummary {
  readonly hostelCount: number;
  readonly bedCount: number;
  readonly occupantCount: number;
  readonly bedsAvailable: number;
  readonly overCapacityHostelCount: number;
}

// --- Roll-call engine ------------------------------------------------------------

/** The minimal view of a roll-call marking the reconciliation needs (its mark). */
export interface RollCallMarkView {
  readonly mark: PresenceMark;
}

/**
 * A roll call's reconciled summary from its per-resident markings against the expected roster — the
 * presence counts and the safety-critical unaccounted-for count. A resident marked `present` or `late`
 * is physically present; `on_leave` is excused elsewhere; `absent` is unaccounted. Accounted-for =
 * present + late + on_leave; unaccounted-for = expected − accounted-for (the absent plus any unmarked
 * resident). Pure and exact.
 */
export interface RollCallSummary {
  readonly expectedCount: number;
  readonly markedCount: number;
  readonly presentCount: number;
  readonly lateCount: number;
  readonly onLeaveCount: number;
  readonly absentCount: number;
  readonly accountedForCount: number;
  readonly unaccountedForCount: number;
  readonly allAccountedFor: boolean;
}

// --- Inspection compliance -------------------------------------------------------

/**
 * A hostel inspection's compliance as of a date — its type, last recorded outcome and next-due date, the
 * derived status (`valid`, `due_soon` within the warning window, or `overdue`) and the whole days to the
 * next due date (negative once overdue). Descriptive and exact; computed from the next-due date, never
 * stored.
 */
export interface InspectionCompliance {
  readonly type: InspectionType;
  readonly lastOutcome: InspectionOutcome;
  readonly nextDueOn: string;
  readonly status: ComplianceStatus;
  readonly daysToDue: number;
}
