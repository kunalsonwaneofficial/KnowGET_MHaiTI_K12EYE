import type {
  AssignmentView,
  ClassroomSessionView,
  InstructionalIndicators,
  LessonPlanView,
  UnitPlanView,
} from "./instructional-view";

/**
 * Compute descriptive instructional indicators for a scope from its unit plans, lesson plans,
 * classroom sessions and assignments. Pure and deterministic; every rate is division-safe and
 * two-decimal, and a scope with no activity yields zeroes rather than throwing. Descriptive
 * only — no prediction (a P2-D09 non-goal).
 */
export function computeInstructionalIndicators(scope: {
  readonly unitPlans?: readonly UnitPlanView[];
  readonly lessonPlans?: readonly LessonPlanView[];
  readonly sessions?: readonly ClassroomSessionView[];
  readonly assignments?: readonly AssignmentView[];
}): InstructionalIndicators {
  const unitPlans = scope.unitPlans ?? [];
  const lessonPlans = scope.lessonPlans ?? [];
  const sessions = scope.sessions ?? [];
  const assignments = scope.assignments ?? [];

  const round = (value: number): number => Math.round(value * 100) / 100;
  const isDelivered = (s: ClassroomSessionView): boolean =>
    s.status === "delivered" || s.status === "completed";

  const unitsPlanned = unitPlans.length;
  const lessonsPlanned = lessonPlans.length;
  const lessonsApproved = lessonPlans.filter((l) => l.status === "approved").length;

  const sessionsScheduled = sessions.filter((s) => s.status === "scheduled").length;
  const sessionsDelivered = sessions.filter(isDelivered).length;
  const sessionsCompleted = sessions.filter((s) => s.status === "completed").length;
  const nonCancelled = sessions.filter((s) => s.status !== "cancelled").length;

  const assignmentsPublished = assignments.filter(
    (a) => a.status === "published" || a.status === "closed",
  ).length;

  // Curriculum coverage: of the distinct outcomes targeted by (non-archived) unit plans, how
  // many are covered by an approved lesson plan.
  const targeted = new Set<string>();
  for (const unit of unitPlans) {
    if (unit.status !== "archived") {
      for (const outcomeId of unit.learningOutcomeIds) {
        targeted.add(outcomeId);
      }
    }
  }
  const coveredByLessons = new Set<string>();
  for (const lesson of lessonPlans) {
    if (lesson.status === "approved") {
      for (const outcomeId of lesson.learningOutcomeIds) {
        coveredByLessons.add(outcomeId);
      }
    }
  }
  const outcomesCovered = [...targeted].filter((id) => coveredByLessons.has(id)).length;
  const outcomesTargeted = targeted.size;
  const curriculumCoverage =
    outcomesTargeted === 0 ? 0 : round((100 * outcomesCovered) / outcomesTargeted);

  // Lesson completion: completed sessions over sessions that were not cancelled.
  const lessonCompletionRate =
    nonCancelled === 0 ? 0 : round((100 * sessionsCompleted) / nonCancelled);

  // Teaching consistency: over delivered sessions that had planned topics, the average share of
  // planned topics actually covered (capped at 1 per session).
  const deliveredWithPlan = sessions.filter((s) => isDelivered(s) && s.plannedTopics.length > 0);
  const consistencySum = deliveredWithPlan.reduce(
    (sum, s) => sum + Math.min(s.actualTopicsCovered.length / s.plannedTopics.length, 1),
    0,
  );
  const teachingConsistency =
    deliveredWithPlan.length === 0 ? 0 : round((100 * consistencySum) / deliveredWithPlan.length);

  // Student engagement: engaged learners over expected, summed across sessions that recorded a
  // participation summary.
  let engagedTotal = 0;
  let expectedTotal = 0;
  for (const session of sessions) {
    if (session.participation) {
      engagedTotal += session.participation.engaged;
      expectedTotal += session.participation.expected;
    }
  }
  const studentEngagement = expectedTotal === 0 ? 0 : round((100 * engagedTotal) / expectedTotal);

  // Learning pace: how far delivery has progressed through the planned lessons.
  const learningPace = lessonsPlanned === 0 ? 0 : round((100 * sessionsDelivered) / lessonsPlanned);

  // Resource utilisation: average distinct resources referenced per delivered session.
  const resourceRefTotal = sessions
    .filter(isDelivered)
    .reduce((sum, s) => sum + new Set(s.resourcesUsedIds).size, 0);
  const resourceUtilization =
    sessionsDelivered === 0 ? 0 : round(resourceRefTotal / sessionsDelivered);

  // Submission rate: submitted or late over all tracked submissions across assignments.
  let submissionsTracked = 0;
  let submissionsMade = 0;
  for (const assignment of assignments) {
    for (const submission of assignment.submissions) {
      submissionsTracked += 1;
      if (submission.status === "submitted" || submission.status === "late") {
        submissionsMade += 1;
      }
    }
  }
  const submissionRate =
    submissionsTracked === 0 ? 0 : round((100 * submissionsMade) / submissionsTracked);

  const instructionalWorkload = lessonsPlanned + sessions.length + assignments.length;

  return {
    unitsPlanned,
    lessonsPlanned,
    lessonsApproved,
    sessionsScheduled,
    sessionsDelivered,
    sessionsCompleted,
    assignmentsPublished,
    outcomesTargeted,
    outcomesCovered,
    curriculumCoverage,
    lessonCompletionRate,
    teachingConsistency,
    studentEngagement,
    learningPace,
    resourceUtilization,
    submissionRate,
    instructionalWorkload,
  };
}
