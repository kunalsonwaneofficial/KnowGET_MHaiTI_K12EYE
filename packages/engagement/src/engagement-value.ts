/**
 * Value objects for the Unified Communication, Engagement & Collaboration Platform (P2-D22). Every set is a
 * closed string-literal union backed by a `readonly` tuple, so the domain, the DTOs and the database agree on
 * the same vocabulary. Nothing here is money — this domain does not bill or buy — and channel delivery
 * (email / SMS / push / in-app) is the platform notifications service's (P1-M05), not modelled here.
 */

// --- Audience --------------------------------------------------------------------

/** An audience's lifecycle — active (usable as a target) or archived (retired). */
export const AUDIENCE_STATUSES = ["active", "archived"] as const;
export type AudienceStatus = (typeof AUDIENCE_STATUSES)[number];

// --- Announcement ----------------------------------------------------------------

/** The category of an announcement. */
export const ANNOUNCEMENT_CATEGORIES = [
  "general",
  "academic",
  "event",
  "administrative",
  "emergency",
  "celebration",
  "reminder",
  "other",
] as const;
export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number];

/** An announcement's priority. */
export const ANNOUNCEMENT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type AnnouncementPriority = (typeof ANNOUNCEMENT_PRIORITIES)[number];

/** An announcement's lifecycle. */
export const ANNOUNCEMENT_STATUSES = [
  "draft",
  "scheduled",
  "published",
  "archived",
  "cancelled",
] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

// --- Message thread --------------------------------------------------------------

/** A message thread's lifecycle — open (accepting messages), closed (no more), or archived. */
export const THREAD_STATUSES = ["open", "closed", "archived"] as const;
export type ThreadStatus = (typeof THREAD_STATUSES)[number];

// --- Survey ----------------------------------------------------------------------

/** The kind of feedback instrument. */
export const SURVEY_TYPES = ["survey", "poll", "feedback", "consent_check"] as const;
export type SurveyType = (typeof SURVEY_TYPES)[number];

/** The type of a survey question — how its answer is shaped. */
export const QUESTION_TYPES = ["single_choice", "multi_choice", "rating", "text"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** The closed-form (option-bearing, tally-able) question types. */
export const CHOICE_QUESTION_TYPES = ["single_choice", "multi_choice", "rating"] as const;

/** A survey's lifecycle — draft, open (accepting responses), closed, or archived. */
export const SURVEY_STATUSES = ["draft", "open", "closed", "archived"] as const;
export type SurveyStatus = (typeof SURVEY_STATUSES)[number];
