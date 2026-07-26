/**
 * Value objects for the Alumni, Community & Relationship Platform (P2-D24). Every set is a closed
 * string-literal union backed by a `readonly` tuple, so the domain, the DTOs and the database agree on the
 * same vocabulary. Nothing here is money — gift amounts are Finance's (P2-D14) — and the alumnus/student
 * lifecycle record is Student Lifecycle's (P2-D03), referenced not re-modelled.
 */

// --- Alumni profile --------------------------------------------------------------

/** An alumni-network membership's lifecycle. `opted_out` is a terminal unsubscribe from the network. */
export const ALUMNI_STATUSES = ["active", "lapsed", "opted_out"] as const;
export type AlumniStatus = (typeof ALUMNI_STATUSES)[number];

/** The non-terminal alumni statuses — still in the network. */
export const OPEN_ALUMNI_STATUSES = ["active", "lapsed"] as const;

// --- Alumni chapter --------------------------------------------------------------

/** The kind of alumni chapter / community. */
export const CHAPTER_TYPES = [
  "regional",
  "interest",
  "class_year",
  "professional",
  "other",
] as const;
export type ChapterType = (typeof CHAPTER_TYPES)[number];

/** An alumni chapter's lifecycle. */
export const CHAPTER_STATUSES = ["forming", "active", "inactive", "archived"] as const;
export type ChapterStatus = (typeof CHAPTER_STATUSES)[number];

// --- Chapter membership ----------------------------------------------------------

/** An alumnus's role within a chapter. */
export const MEMBERSHIP_ROLES = ["member", "officer", "lead"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

/** A chapter membership's lifecycle. */
export const MEMBERSHIP_STATUSES = ["active", "left"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

// --- Alumni event ----------------------------------------------------------------

/** The kind of alumni event. */
export const EVENT_TYPES = [
  "reunion",
  "networking",
  "webinar",
  "fundraiser",
  "volunteer",
  "other",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** An alumni event's lifecycle. Registrations are accepted only while `open`. */
export const EVENT_STATUSES = [
  "draft",
  "scheduled",
  "open",
  "closed",
  "completed",
  "cancelled",
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

// --- Event registration ----------------------------------------------------------

/** An event registration's lifecycle. */
export const REGISTRATION_STATUSES = ["registered", "attended", "no_show", "cancelled"] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

// --- Mentorship connection -------------------------------------------------------

/** A mentorship connection's lifecycle. */
export const MENTORSHIP_STATUSES = ["proposed", "active", "completed", "ended"] as const;
export type MentorshipStatus = (typeof MENTORSHIP_STATUSES)[number];

// --- Contribution ----------------------------------------------------------------

/** The kind of giving/contribution act (recorded as a relationship fact — the amount is Finance's, P2-D14). */
export const CONTRIBUTION_TYPES = ["pledge", "gift", "recurring", "in_kind"] as const;
export type ContributionType = (typeof CONTRIBUTION_TYPES)[number];

/** The non-monetary recognition tier the institution records for a contribution. */
export const RECOGNITION_TIERS = ["supporter", "patron", "benefactor", "founder"] as const;
export type RecognitionTier = (typeof RECOGNITION_TIERS)[number];

// --- Engagement level (derived) --------------------------------------------------

/** The engagement level the engine derives from an alumnus's activity. */
export const ENGAGEMENT_LEVELS = ["inactive", "casual", "engaged", "champion"] as const;
export type EngagementLevel = (typeof ENGAGEMENT_LEVELS)[number];
