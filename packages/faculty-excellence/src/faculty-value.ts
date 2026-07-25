/**
 * The lifecycle of a competency framework — the professional-standards rubric faculty are developed
 * against. `draft` while being authored, `active` once adopted, `archived` when retired.
 */
export const FRAMEWORK_STATUSES = ["draft", "active", "archived"] as const;

export type FrameworkStatus = (typeof FRAMEWORK_STATUSES)[number];

/**
 * The lifecycle of a classroom/practice observation: `scheduled` → `conducted` (evidence and
 * ratings recorded) → `shared` (released to the observed staff member) → `acknowledged` (seen by
 * them). Only an acknowledged observation counts toward faculty-growth standing.
 */
export const OBSERVATION_STATUSES = ["scheduled", "conducted", "shared", "acknowledged"] as const;

export type ObservationStatus = (typeof OBSERVATION_STATUSES)[number];

/** The kind of observation. */
export const OBSERVATION_TYPES = ["formal", "informal", "peer", "learning_walk", "self"] as const;

export type ObservationType = (typeof OBSERVATION_TYPES)[number];

/**
 * The lifecycle of a coaching engagement (a coach↔coachee cycle). "Running" (sessions may be logged)
 * means `active` specifically — see {@link isEngagementRunning} in `coaching-engagement.ts`.
 */
export const ENGAGEMENT_STATUSES = ["proposed", "active", "completed", "cancelled"] as const;

export type EngagementStatus = (typeof ENGAGEMENT_STATUSES)[number];

/** The lifecycle of a professional-development activity. Only a `completed` activity earns hours. */
export const ACTIVITY_STATUSES = ["planned", "enrolled", "completed", "cancelled"] as const;

export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

/** The lifecycle of a development goal. */
export const GOAL_STATUSES = ["draft", "active", "achieved", "abandoned"] as const;

export type GoalStatus = (typeof GOAL_STATUSES)[number];

/** The categories professional-development hours are tracked and required against. */
export const PD_CATEGORIES = [
  "pedagogy",
  "subject_knowledge",
  "classroom_management",
  "assessment",
  "digital",
  "inclusion",
  "wellbeing",
  "leadership",
  "compliance",
  "other",
] as const;

export type PdCategory = (typeof PD_CATEGORIES)[number];

/** Narrow an arbitrary string to a {@link PdCategory}. */
export const isPdCategory = (value: string): value is PdCategory =>
  (PD_CATEGORIES as readonly string[]).includes(value);

/**
 * A descriptive professional-growth band for a staff member — an ascending scale
 * (`emerging < developing < proficient < distinguished`), the shape common to teacher-practice
 * rubrics. Descriptive and explainable (derived from observed practice, goal progress and PD
 * standing), **never a prediction** (predictive modelling is a P2-D13 non-goal deferred to the
 * intelligence core, P2-D28).
 */
export const GROWTH_BANDS = ["emerging", "developing", "proficient", "distinguished"] as const;

export type GrowthBand = (typeof GROWTH_BANDS)[number];

/** Narrow an arbitrary string to a {@link GrowthBand}. */
export const isGrowthBand = (value: string): value is GrowthBand =>
  (GROWTH_BANDS as readonly string[]).includes(value);

/** The ordinal strength of a growth band (0 = emerging … 3 = distinguished). */
export const growthRank = (band: GrowthBand): number => GROWTH_BANDS.indexOf(band);

/** The stronger (higher) of two growth bands. */
export const betterGrowth = (a: GrowthBand, b: GrowthBand): GrowthBand =>
  growthRank(a) >= growthRank(b) ? a : b;

/** The observation/competency rating scale — an integer 1–4 aligned to the growth bands. */
export const MIN_RATING = 1;
export const MAX_RATING = 4;

/** Whether a value is a valid 1–4 rating (need not be an integer — half-ratings are allowed). */
export const isValidRating = (rating: number): boolean =>
  Number.isFinite(rating) && rating >= MIN_RATING && rating <= MAX_RATING;

/** The growth band a 1–4 rating falls in — the transparent mapping used across the domain. */
export const bandForRating = (rating: number): GrowthBand => {
  if (rating >= 3.5) {
    return "distinguished";
  }
  if (rating >= 2.5) {
    return "proficient";
  }
  if (rating >= 1.5) {
    return "developing";
  }
  return "emerging";
};
