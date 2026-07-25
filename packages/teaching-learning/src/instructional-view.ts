import type { Uuid } from "@knowget/types";
import type { AssignmentStatus, SubmissionStatus } from "./assignment-type";
import type { ClassroomSessionStatus, ParticipationSummary } from "./classroom-session-value";
import type { LessonPlanStatus } from "./lesson-plan-value";
import type { UnitPlanStatus } from "./unit-plan-value";

/**
 * The narrow views the instructional-intelligence engine consumes. Each aggregate structurally
 * satisfies its view, so the engine depends on no aggregate and is exhaustively unit-testable
 * in isolation — the same pure-engine-over-views pattern used by the scheduling conflict engine
 * (P2-D07) and the attendance policy/presence engines (P2-D08).
 */

/** The minimal view of a unit plan the engine needs (the curriculum-coverage target + pace). */
export interface UnitPlanView {
  readonly status: UnitPlanStatus;
  readonly learningOutcomeIds: readonly Uuid[];
  readonly estimatedInstructionalHours: number;
}

/** The minimal view of a lesson plan the engine needs (approved lessons cover outcomes). */
export interface LessonPlanView {
  readonly status: LessonPlanStatus;
  readonly learningOutcomeIds: readonly Uuid[];
}

/** The minimal view of a classroom session the engine needs (planned vs actual, resources, engagement). */
export interface ClassroomSessionView {
  readonly status: ClassroomSessionStatus;
  readonly plannedTopics: readonly string[];
  readonly actualTopicsCovered: readonly string[];
  readonly resourcesUsedIds: readonly Uuid[];
  readonly participation: ParticipationSummary | null;
}

/** The minimal view of an assignment the engine needs (submission completion). */
export interface AssignmentView {
  readonly status: AssignmentStatus;
  readonly submissions: readonly { readonly status: SubmissionStatus }[];
}

/**
 * AI-ready, read-only instructional indicators for a scope (a subject, section, teacher or
 * organization). Descriptive analytics only — predictive coaching and optimisation belong to
 * the Institutional Intelligence program, which consumes these signals. Percentages are
 * 0–100, two-decimal; counts are whole numbers; `resourceUtilization` is an average count.
 */
export interface InstructionalIndicators {
  readonly unitsPlanned: number;
  readonly lessonsPlanned: number;
  readonly lessonsApproved: number;
  readonly sessionsScheduled: number;
  readonly sessionsDelivered: number;
  readonly sessionsCompleted: number;
  readonly assignmentsPublished: number;
  readonly outcomesTargeted: number;
  readonly outcomesCovered: number;
  readonly curriculumCoverage: number;
  readonly lessonCompletionRate: number;
  readonly teachingConsistency: number;
  readonly studentEngagement: number;
  readonly learningPace: number;
  readonly resourceUtilization: number;
  readonly submissionRate: number;
  readonly instructionalWorkload: number;
}
