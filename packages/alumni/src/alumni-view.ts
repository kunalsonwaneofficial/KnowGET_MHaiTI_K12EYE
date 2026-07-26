import type { EngagementLevel } from "./alumni-value";

/**
 * The narrow views the two pure engines consume. The aggregates structurally satisfy them, so the engines
 * depend on no aggregate — the same pure-engine-over-views pattern used across P2-D07…D23.
 */

// --- Engagement engine -----------------------------------------------------------

/**
 * The activity signals the engagement engine reads for one alumnus — the counts of their network activity.
 * Each is a non-negative count; the engine weights, sums and caps them into a 0–100 engagement score.
 */
export interface AlumniActivityView {
  readonly eventsAttended: number;
  readonly activeChapters: number;
  readonly activeMentorships: number;
  readonly contributionsCount: number;
}

/** An alumnus's engagement — a 0–100 score and the level it falls in. Derived; never stored as truth. */
export interface AlumniEngagement {
  readonly score: number;
  readonly level: EngagementLevel;
}

/** The count of alumni at one engagement level. */
export interface EngagementLevelCount {
  readonly level: EngagementLevel;
  readonly count: number;
}

/**
 * The engagement distribution over a set of alumni — the count, the average score and the per-level counts.
 * Derived by the pure engine.
 */
export interface EngagementSummary {
  readonly alumniCount: number;
  readonly averageScore: number;
  readonly levels: readonly EngagementLevelCount[];
}

// --- Participation engine --------------------------------------------------------

/**
 * The minimal view of an event's participation the engine reads — its capacity and the registered/attended
 * counts. A capacity of 0 means "not capacity-tracked" (no cap).
 */
export interface EventParticipationView {
  readonly capacity: number;
  readonly registeredCount: number;
  readonly attendedCount: number;
}

/**
 * An event's participation picture — seats filled against capacity, seats remaining, whether it is
 * over-subscribed, the fill percent and the attendance rate. Derived by the pure engine.
 */
export interface EventParticipation {
  readonly capacity: number;
  readonly registeredCount: number;
  readonly attendedCount: number;
  readonly remaining: number;
  readonly overSubscribed: boolean;
  readonly fillPercent: number;
  readonly attendanceRate: number;
}

/** The rolled-up participation picture over a set of events — totals and overall fill / attendance. */
export interface ParticipationSummary {
  readonly eventCount: number;
  readonly totalCapacity: number;
  readonly totalRegistered: number;
  readonly totalAttended: number;
  readonly overallFillPercent: number;
  readonly overallAttendanceRate: number;
}
