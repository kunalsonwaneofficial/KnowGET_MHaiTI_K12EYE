import type { ComfortBand, ServiceStatusBand } from "./facilities-value";

/**
 * The narrow views the two pure engines consume. The aggregates structurally satisfy them, so the engines
 * depend on no aggregate — the same pure-engine-over-views pattern used across P2-D07…D19.
 */

// --- Building-condition engine ---------------------------------------------------

/** The minimal view of a space the condition engine reads — its status and its capacity. */
export interface SpaceConditionView {
  readonly status: string;
  readonly capacity: number;
}

/** The minimal view of a facility system the condition engine reads — its status. */
export interface SystemConditionView {
  readonly status: string;
}

/**
 * A building's condition — its spaces (count, available, out-of-service, total and available capacity) and
 * its fixed systems (count, operational, under maintenance), and a readiness percent (available capacity
 * against total). Descriptive and exact, derived by the pure engine — never stored.
 */
export interface BuildingCondition {
  readonly spaceCount: number;
  readonly availableSpaceCount: number;
  readonly outOfServiceSpaceCount: number;
  readonly totalCapacity: number;
  readonly availableCapacity: number;
  readonly systemCount: number;
  readonly operationalSystemCount: number;
  readonly systemsUnderMaintenance: number;
  readonly readinessPercent: number;
}

/** The minimal view of a building's condition the campus rollup needs. */
export interface BuildingConditionMemberView {
  readonly spaceCount: number;
  readonly availableSpaceCount: number;
  readonly totalCapacity: number;
  readonly availableCapacity: number;
  readonly systemCount: number;
  readonly operationalSystemCount: number;
}

/** The campus-wide condition picture — building/space/system counts, capacities and operational systems. */
export interface CampusConditionSummary {
  readonly buildingCount: number;
  readonly spaceCount: number;
  readonly availableSpaceCount: number;
  readonly totalCapacity: number;
  readonly availableCapacity: number;
  readonly systemCount: number;
  readonly operationalSystemCount: number;
}

/**
 * A facility system's service status as of a date — the next-due date (null when never serviced) and
 * whether it is due soon (within the warning window) or overdue. Derived, clock-free — never stored.
 */
export interface ServiceStatus {
  readonly nextDueOn: string | null;
  readonly band: ServiceStatusBand;
  readonly isDueSoon: boolean;
  readonly isOverdue: boolean;
}

// --- Comfort engine --------------------------------------------------------------

/** An acceptable range for a metric — a reading below `min` or above `max` breaches comfort. */
export interface ComfortThreshold {
  readonly metric: string;
  readonly min: number;
  readonly max: number;
}

/** The minimal view of a latest reading the comfort engine consumes — its metric and value. */
export interface MetricReadingView {
  readonly metric: string;
  readonly value: number;
}

/**
 * A space's comfort assessment — its band (comfortable / marginal / poor), the metrics currently breaching
 * their threshold, and the reading and breach counts. Derived by the pure engine — never stored.
 */
export interface ComfortAssessment {
  readonly band: ComfortBand;
  readonly breachingMetrics: readonly string[];
  readonly readingCount: number;
  readonly breachCount: number;
}
