/**
 * The kind of co-curricular activity a participation record captures — broadening
 * attendance into institutional engagement.
 */
export const ACTIVITY_TYPES = [
  "club",
  "sport",
  "cultural",
  "competition",
  "institutional_event",
  "community_service",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** A coarse engagement level for a participation record. */
export const ENGAGEMENT_LEVELS = ["low", "medium", "high"] as const;

export type EngagementLevel = (typeof ENGAGEMENT_LEVELS)[number];

/** Narrow an arbitrary string to an {@link ActivityType}. */
export const isActivityType = (value: string): value is ActivityType =>
  (ACTIVITY_TYPES as readonly string[]).includes(value);
