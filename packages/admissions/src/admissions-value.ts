/**
 * Value objects for the Admissions, Marketing, Enrollment & Growth Platform (P2-D23). Every set is a closed
 * string-literal union backed by a `readonly` tuple, so the domain, the DTOs and the database agree on the
 * same vocabulary. Nothing here is money — application and admission fees are Finance's (P2-D14) — and the
 * prospect/applicant/student records are Student Lifecycle's (P2-D03), referenced not re-modelled.
 */

// --- Marketing campaign ----------------------------------------------------------

/** The channel a marketing campaign runs through. */
export const CAMPAIGN_CHANNELS = [
  "referral",
  "online_ad",
  "social_media",
  "event",
  "print",
  "walk_in",
  "partner",
  "other",
] as const;
export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

/** A marketing campaign's lifecycle. */
export const CAMPAIGN_STATUSES = ["draft", "active", "completed", "cancelled"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

// --- Lead ------------------------------------------------------------------------

/** An inbound lead's lifecycle through the top of the funnel. */
export const LEAD_STATUSES = ["new", "contacted", "qualified", "converted", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** The non-terminal lead statuses — a lead still in play. */
export const OPEN_LEAD_STATUSES = ["new", "contacted", "qualified"] as const;

// --- Admission cycle -------------------------------------------------------------

/** An admission cycle's lifecycle. */
export const CYCLE_STATUSES = ["planning", "open", "closed", "archived"] as const;
export type CycleStatus = (typeof CYCLE_STATUSES)[number];

// --- Application -----------------------------------------------------------------

/** An application's lifecycle through the admissions review workflow. */
export const APPLICATION_STATUSES = [
  "submitted",
  "under_review",
  "interview",
  "offered",
  "waitlisted",
  "rejected",
  "withdrawn",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** The non-terminal application statuses — an application still under consideration. */
export const OPEN_APPLICATION_STATUSES = ["submitted", "under_review", "interview"] as const;

// --- Admission evaluation --------------------------------------------------------

/** The kind of entrance evaluation. */
export const EVALUATION_TYPES = [
  "entrance_test",
  "interview",
  "portfolio",
  "group_activity",
  "other",
] as const;
export type EvaluationType = (typeof EVALUATION_TYPES)[number];

/** An evaluator's recommendation from an evaluation. */
export const EVALUATION_RECOMMENDATIONS = ["recommend", "hold", "not_recommend"] as const;
export type EvaluationRecommendation = (typeof EVALUATION_RECOMMENDATIONS)[number];

// --- Offer -----------------------------------------------------------------------

/** An admission offer's lifecycle. */
export const OFFER_STATUSES = ["extended", "accepted", "declined", "expired", "withdrawn"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];
