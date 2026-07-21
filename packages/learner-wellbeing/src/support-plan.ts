import type { ISODateString, Uuid } from "@knowget/types";

/** The lifecycle of a learner support plan. */
export type SupportPlanStatus = "active" | "archived";

/** The standing of a personalized support goal. */
export type SupportGoalStatus = "active" | "achieved" | "abandoned";

/** A personalized support goal with an optional target date. */
export interface SupportGoal {
  readonly id: Uuid;
  readonly description: string;
  readonly status: SupportGoalStatus;
  readonly targetDate: string | null;
  readonly setAt: ISODateString;
}

/**
 * The review schedule for a support plan — how often it is reviewed and when the next and
 * most recent reviews fall. Support plans are living documents, so review cadence is
 * first-class.
 */
export interface ReviewSchedule {
  readonly frequency: string | null;
  readonly nextReviewOn: string | null;
  readonly lastReviewedOn: string | null;
}

/** The empty review schedule a new plan starts from. */
export const EMPTY_REVIEW_SCHEDULE: ReviewSchedule = {
  frequency: null,
  nextReviewOn: null,
  lastReviewedOn: null,
};
