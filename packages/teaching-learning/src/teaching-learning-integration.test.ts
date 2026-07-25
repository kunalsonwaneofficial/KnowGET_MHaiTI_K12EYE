import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { AssignmentService } from "./assignment-service";
import { ClassroomSessionService } from "./classroom-session-service";
import { InstructionalAnalyticsService } from "./instructional-analytics-service";
import { LessonPlanService } from "./lesson-plan-service";
import {
  InMemoryAssignmentRepository,
  InMemoryClassroomSessionRepository,
  InMemoryLessonPlanRepository,
  InMemoryUnitPlanRepository,
  type OrganizationDirectory,
  type SubjectDirectory,
} from "./ports";
import { UnitPlanService } from "./unit-plan-service";

const TENANT = "t1" as TenantId;
const ORG = "org-1" as Uuid;
const SUBJECT = "subj-1" as Uuid;
const O1 = "o1" as Uuid;
const O2 = "o2" as Uuid;

const allow = (allowed: readonly string[]) => ({
  exists: async (_t: TenantId, id: Uuid) => allowed.includes(id),
});

/**
 * End-to-end: plan a unit, plan and approve a lesson, deliver and complete a session, publish
 * an assignment and track submissions — then read instructional indicators back through the
 * analytics service. The aggregates flow straight into the pure engine (no mapping), proving
 * curriculum coverage, completion, pace and submission indicators are consistent end to end.
 */
describe("teaching-learning integration", () => {
  it("plans, delivers and reports instructional indicators for a subject", async () => {
    const unitRepo = new InMemoryUnitPlanRepository();
    const lessonRepo = new InMemoryLessonPlanRepository();
    const sessionRepo = new InMemoryClassroomSessionRepository();
    const assignmentRepo = new InMemoryAssignmentRepository();
    const organizations = allow([ORG]) as OrganizationDirectory;
    const subjects = allow([SUBJECT]) as SubjectDirectory;

    const units = new UnitPlanService({ repository: unitRepo, organizations, subjects });
    const lessons = new LessonPlanService({ repository: lessonRepo, organizations, subjects });
    const sessions = new ClassroomSessionService({ repository: sessionRepo, organizations });
    const assignments = new AssignmentService({
      repository: assignmentRepo,
      organizations,
      subjects,
    });
    const analytics = new InstructionalAnalyticsService({
      unitPlans: unitRepo,
      lessonPlans: lessonRepo,
      sessions: sessionRepo,
      assignments: assignmentRepo,
    });

    // Unit targets two outcomes.
    const unit = await units.create({
      tenantId: TENANT,
      organizationId: ORG,
      subjectId: SUBJECT,
      title: "Fractions",
      learningOutcomeIds: [O1, O2],
      estimatedInstructionalHours: 8,
    });
    await units.activate(TENANT, unit.id);

    // One approved lesson covers one of the two outcomes.
    const lesson = await lessons.create({
      tenantId: TENANT,
      organizationId: ORG,
      subjectId: SUBJECT,
      title: "Equivalent fractions",
      learningOutcomeIds: [O1],
    });
    await lessons.submitForReview(TENANT, lesson.id);
    await lessons.approve(TENANT, lesson.id);

    // One session delivered and completed.
    const session = await sessions.create({
      tenantId: TENANT,
      organizationId: ORG,
      subjectId: SUBJECT,
      title: "Period 1",
      date: "2026-09-15",
      plannedTopics: ["t1", "t2"],
    });
    await sessions.deliver(TENANT, session.id, {
      actualTopicsCovered: ["t1", "t2"],
      resourcesUsedIds: ["r1" as Uuid],
      participation: { expected: 30, engaged: 30 },
    });
    await sessions.complete(TENANT, session.id);

    // One published assignment with two submissions.
    const assignment = await assignments.create({
      tenantId: TENANT,
      organizationId: ORG,
      subjectId: SUBJECT,
      title: "Homework",
      assignmentType: "homework",
    });
    await assignments.publish(TENANT, assignment.id);
    await assignments.recordSubmission(TENANT, assignment.id, {
      studentId: "s1" as Uuid,
      status: "submitted",
    });
    await assignments.recordSubmission(TENANT, assignment.id, {
      studentId: "s2" as Uuid,
      status: "late",
    });

    const ind = await analytics.forSubject(TENANT, SUBJECT);

    expect(ind.unitsPlanned).toBe(1);
    expect(ind.lessonsApproved).toBe(1);
    expect(ind.sessionsCompleted).toBe(1);
    expect(ind.assignmentsPublished).toBe(1);
    // 1 of 2 targeted outcomes covered
    expect(ind.outcomesTargeted).toBe(2);
    expect(ind.outcomesCovered).toBe(1);
    expect(ind.curriculumCoverage).toBe(50);
    // one non-cancelled session, completed
    expect(ind.lessonCompletionRate).toBe(100);
    // full topic coverage and full engagement
    expect(ind.teachingConsistency).toBe(100);
    expect(ind.studentEngagement).toBe(100);
    // both submissions made
    expect(ind.submissionRate).toBe(100);
  });
});
