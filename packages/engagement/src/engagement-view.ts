import type { QuestionType } from "./engagement-value";

/**
 * The narrow views the two pure engines consume. The aggregates structurally satisfy them, so the engines
 * depend on no aggregate — the same pure-engine-over-views pattern used across P2-D07…D21.
 */

// --- Engagement / reach engine ---------------------------------------------------

/**
 * An announcement's reach — its audience size against the number who have acknowledged it, the still-pending
 * count and an acknowledgement percent. Derived by the pure engine — never stored as truth.
 */
export interface AnnouncementReach {
  readonly audienceSize: number;
  readonly acknowledgedCount: number;
  readonly pendingCount: number;
  readonly acknowledgementPercent: number;
}

/** The minimal view of an announcement the engagement rollup reads — its audience size and ack count. */
export interface AnnouncementReachView {
  readonly audienceSize: number;
  readonly acknowledgedCount: number;
}

/**
 * The engagement picture over a set of announcements — the announcement count, the total audience reached,
 * the total acknowledged and the overall acknowledgement percent. Derived by the pure engine.
 */
export interface EngagementSummary {
  readonly announcementCount: number;
  readonly totalAudience: number;
  readonly totalAcknowledged: number;
  readonly acknowledgementPercent: number;
}

// --- Survey-tally engine ---------------------------------------------------------

/** The minimal view of a survey question the tally engine reads — its key, type and options. */
export interface SurveyQuestionView {
  readonly key: string;
  readonly type: QuestionType;
  readonly options: readonly string[];
}

/** One answer within a response — the question it answers and the selected value(s). */
export interface SurveyAnswerView {
  readonly questionKey: string;
  readonly values: readonly string[];
}

/** The minimal view of a submitted response the tally engine reads — its answers. */
export interface SurveyResponseView {
  readonly answers: readonly SurveyAnswerView[];
}

/** The tally of one option within a question — the option value and how many responses selected it. */
export interface OptionTally {
  readonly value: string;
  readonly count: number;
}

/** The tally of one question — how many responses answered it and each option's count (choice types only). */
export interface SurveyQuestionTally {
  readonly questionKey: string;
  readonly answeredCount: number;
  readonly options: readonly OptionTally[];
}

/** The tally over a survey's responses — the total responses and the per-question distribution. */
export interface SurveyTally {
  readonly totalResponses: number;
  readonly questions: readonly SurveyQuestionTally[];
}

/**
 * A survey's response rate — its audience size against the number who have responded, the still-pending count
 * and a response percent. Derived by the pure engine — never stored as truth.
 */
export interface ResponseRate {
  readonly audienceSize: number;
  readonly responseCount: number;
  readonly pendingCount: number;
  readonly responsePercent: number;
}
