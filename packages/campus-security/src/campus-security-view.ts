import type { AccessDecision, AccessDecisionReason } from "./campus-security-value";

/**
 * The narrow views the two pure engines consume. The aggregates structurally satisfy them, so the engines
 * depend on no aggregate — the same pure-engine-over-views pattern used across P2-D07…D20.
 */

// --- Presence engine -------------------------------------------------------------

/** The minimal view of a visit the presence engine reads — its status (checked-in ⇒ on-site). */
export interface VisitPresenceView {
  readonly status: string;
}

/**
 * A zone's live presence — how many visitors are on-site (checked-in visits) against its safe-occupancy
 * capacity, whether it is over capacity, and an occupancy percent. Derived by the pure engine — never stored.
 */
export interface ZonePresence {
  readonly onSiteCount: number;
  readonly capacity: number;
  readonly available: number;
  readonly overCapacity: boolean;
  readonly occupancyPercent: number;
}

/** The minimal view of a zone's presence the site rollup needs. */
export interface ZonePresenceMemberView {
  readonly onSiteCount: number;
  readonly capacity: number;
}

/** The campus-wide presence picture — zone/on-site counts and total capacity. */
export interface SitePresenceSummary {
  readonly zoneCount: number;
  readonly onSiteCount: number;
  readonly totalCapacity: number;
}

/**
 * A drill's muster status — the expected roster against the accounted-for headcount, and the
 * **safety-critical unaccounted-for** number, whether everyone is accounted for, and a completion percent.
 * Derived by the pure engine — never stored.
 */
export interface MusterStatus {
  readonly expectedCount: number;
  readonly accountedCount: number;
  readonly unaccountedFor: number;
  readonly allAccountedFor: boolean;
  readonly completionPercent: number;
}

// --- Access engine ---------------------------------------------------------------

/** The minimal view of a credential the access engine reads — its status, granted zones and expiry. */
export interface CredentialAccessView {
  readonly status: string;
  readonly grantedZoneIds: readonly string[];
  readonly expiresOn: string | null;
}

/** The minimal view of a zone the access engine reads — its id and status. */
export interface ZoneAccessView {
  readonly id: string;
  readonly status: string;
}

/** The result of an access decision — the outcome and the reason code. Derived, never stored on its own. */
export interface AccessEvaluation {
  readonly decision: AccessDecision;
  readonly reason: AccessDecisionReason;
}

/** The minimal view of an access event the activity rollup reads — its decision. */
export interface AccessActivityView {
  readonly decision: string;
}

/** The access-activity picture over a set of events — total, granted and denied counts. */
export interface AccessActivitySummary {
  readonly total: number;
  readonly granted: number;
  readonly denied: number;
}
