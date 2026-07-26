/**
 * The narrow views the two pure engines consume. The aggregates structurally satisfy them, so the engines
 * depend on no aggregate — the same pure-engine-over-views pattern used across P2-D07…D18.
 */

// --- Sick-bay occupancy engine ---------------------------------------------------

/**
 * A health centre's sick-bay occupancy — its bed capacity against the patients currently admitted: the
 * beds still available (may be negative if over-admitted), the occupancy percent, and whether it is over
 * capacity. Descriptive and exact, derived by the pure engine — never stored.
 */
export interface BayOccupancy {
  readonly bedCapacity: number;
  readonly occupantCount: number;
  readonly bedsAvailable: number;
  readonly occupancyPercent: number;
  readonly overCapacity: boolean;
}

/** The minimal view of a centre's occupancy the institution rollup needs. */
export interface BayOccupancyMemberView {
  readonly bedCapacity: number;
  readonly occupantCount: number;
  readonly overCapacity: boolean;
}

/**
 * The institution-wide sick-bay picture — centre count, total beds and occupants, the beds available and
 * the count of over-capacity centres. Descriptive and exact.
 */
export interface ClinicalOccupancySummary {
  readonly centreCount: number;
  readonly bedCapacity: number;
  readonly occupantCount: number;
  readonly bedsAvailable: number;
  readonly overCapacityCentreCount: number;
}

// --- Medication-schedule engine --------------------------------------------------

/**
 * A prescription's dose schedule as of a date — the total doses the course prescribes, how many have been
 * administered and remain, how many are due by now, how many of those are overdue (due but not yet given),
 * and whether the course is complete or still active. Derived by the pure engine — never stored; carries
 * no money and no drug detail.
 */
export interface MedicationSchedule {
  readonly totalDoses: number;
  readonly dosesAdministered: number;
  readonly dosesRemaining: number;
  readonly dosesDue: number;
  readonly overdueDoses: number;
  readonly isComplete: boolean;
  readonly isActive: boolean;
}
