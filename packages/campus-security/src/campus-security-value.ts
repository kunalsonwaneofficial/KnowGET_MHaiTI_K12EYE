/**
 * Value objects for the Campus Security, Safety & Visitor Platform (P2-D21). Every set is a closed
 * string-literal union backed by a `readonly` tuple, so the domain, the DTOs and the database agree on the
 * same vocabulary. Nothing here is money — security-service billing and guard-service procurement are out of
 * scope (Finance P2-D14 / Procurement & Assets P2-D15), and the standing safeguarding record is Learner
 * Wellbeing's (P2-D05).
 */

// --- Visitor ---------------------------------------------------------------------

/** The kind of visitor to the campus. */
export const VISITOR_TYPES = [
  "guest",
  "parent",
  "vendor",
  "contractor",
  "official",
  "other",
] as const;
export type VisitorType = (typeof VISITOR_TYPES)[number];

/** A visitor master's lifecycle — active, blocked (deny future visits), or archived. */
export const VISITOR_STATUSES = ["active", "blocked", "archived"] as const;
export type VisitorStatus = (typeof VISITOR_STATUSES)[number];

// --- Visit -----------------------------------------------------------------------

/** A visit's lifecycle. */
export const VISIT_STATUSES = [
  "requested",
  "approved",
  "checked_in",
  "checked_out",
  "denied",
  "cancelled",
  "expired",
] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

/** The non-terminal visit statuses — a visit still on the books. */
export const OPEN_VISIT_STATUSES = ["requested", "approved", "checked_in"] as const;

// --- Access zone -----------------------------------------------------------------

/** A controlled area's security level. */
export const SECURITY_LEVELS = ["public", "restricted", "secure", "high_security"] as const;
export type SecurityLevel = (typeof SECURITY_LEVELS)[number];

/** An access zone's lifecycle — active, temporarily locked down, or permanently decommissioned. */
export const ZONE_STATUSES = ["active", "locked_down", "decommissioned"] as const;
export type ZoneStatus = (typeof ZONE_STATUSES)[number];

// --- Access credential -----------------------------------------------------------

/** The kind of holder an access credential is issued to. */
export const CREDENTIAL_HOLDER_TYPES = ["employee", "person", "visitor"] as const;
export type CredentialHolderType = (typeof CREDENTIAL_HOLDER_TYPES)[number];

/** An access credential's lifecycle — active, temporarily suspended, or permanently revoked. */
export const CREDENTIAL_STATUSES = ["active", "suspended", "revoked"] as const;
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];

// --- Access event ----------------------------------------------------------------

/** The outcome of an access decision. */
export const ACCESS_DECISIONS = ["granted", "denied"] as const;
export type AccessDecision = (typeof ACCESS_DECISIONS)[number];

/** The reason code for an access decision — `ok` when granted, otherwise why it was denied. */
export const ACCESS_DECISION_REASONS = [
  "ok",
  "credential_inactive",
  "credential_expired",
  "zone_not_granted",
  "zone_locked_down",
  "zone_unavailable",
] as const;
export type AccessDecisionReason = (typeof ACCESS_DECISION_REASONS)[number];

// --- Security incident -----------------------------------------------------------

/** The category of a security/safety incident. */
export const INCIDENT_CATEGORIES = [
  "theft",
  "trespass",
  "vandalism",
  "altercation",
  "hazard",
  "fire",
  "lost_found",
  "other",
] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

/** An incident's severity. */
export const INCIDENT_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

/** An incident's lifecycle. */
export const INCIDENT_STATUSES = [
  "reported",
  "triaged",
  "investigating",
  "resolved",
  "closed",
  "cancelled",
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

/** The non-terminal incident statuses — an "open" incident still on the books. */
export const OPEN_INCIDENT_STATUSES = ["reported", "triaged", "investigating"] as const;

// --- Emergency drill -------------------------------------------------------------

/** The type of emergency drill. */
export const DRILL_TYPES = [
  "fire",
  "lockdown",
  "evacuation",
  "earthquake",
  "shelter_in_place",
  "other",
] as const;
export type DrillType = (typeof DRILL_TYPES)[number];

/** An emergency drill's lifecycle. */
export const DRILL_STATUSES = ["scheduled", "in_progress", "completed", "cancelled"] as const;
export type DrillStatus = (typeof DRILL_STATUSES)[number];
