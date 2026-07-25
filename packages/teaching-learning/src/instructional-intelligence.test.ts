import { describe, expect, it } from "vitest";
import type { Uuid } from "@knowget/types";
import { computeInstructionalIndicators } from "./instructional-intelligence";
import type {
  AssignmentView,
  ClassroomSessionView,
  LessonPlanView,
  UnitPlanView,
} from "./instructional-view";
import type { SubmissionStatus } from "./assignment-type";

const id = (s: string): Uuid => s as Uuid;

describe("instructional-intelligence", () => {
  it("returns all-zero indicators for an empty scope", () => {
    const ind = computeInstructionalIndicators({});
    expect(ind.unitsPlanned).toBe(0);
    expect(ind.curriculumCoverage).toBe(0);
    expect(ind.lessonCompletionRate).toBe(0);
    expect(ind.teachingConsistency).toBe(0);
    expect(ind.studentEngagement).toBe(0);
    expect(ind.learningPace).toBe(0);
    expect(ind.resourceUtilization).toBe(0);
    expect(ind.submissionRate).toBe(0);
    expect(ind.instructionalWorkload).toBe(0);
  });

  it("computes coverage, completion, consistency, engagement, pace and utilisation", () => {
    const unitPlans: UnitPlanView[] = [
      {
        status: "active",
        learningOutcomeIds: [id("o1"), id("o2"), id("o3")],
        estimatedInstructionalHours: 10,
      },
      {
        status: "active",
        learningOutcomeIds: [id("o3"), id("o4")],
        estimatedInstructionalHours: 10,
      },
    ];
    const lessonPlans: LessonPlanView[] = [
      { status: "approved", learningOutcomeIds: [id("o1"), id("o2")] },
      { status: "approved", learningOutcomeIds: [id("o3")] },
      { status: "draft", learningOutcomeIds: [id("o4")] },
    ];
    const sessions: ClassroomSessionView[] = [
      {
        status: "completed",
        plannedTopics: ["t1", "t2"],
        actualTopicsCovered: ["t1", "t2"],
        resourcesUsedIds: [id("r1"), id("r2")],
        participation: { expected: 30, engaged: 27 },
      },
      {
        status: "delivered",
        plannedTopics: ["t1", "t2", "t3", "t4"],
        actualTopicsCovered: ["t1", "t2"],
        resourcesUsedIds: [id("r1")],
        participation: { expected: 30, engaged: 15 },
      },
      {
        status: "scheduled",
        plannedTopics: ["t1"],
        actualTopicsCovered: [],
        resourcesUsedIds: [],
        participation: null,
      },
      {
        status: "cancelled",
        plannedTopics: [],
        actualTopicsCovered: [],
        resourcesUsedIds: [],
        participation: null,
      },
    ];
    const sub = (status: SubmissionStatus) => ({ status });
    const assignments: AssignmentView[] = [
      { status: "published", submissions: [sub("submitted"), sub("late"), sub("missing")] },
      { status: "draft", submissions: [] },
      { status: "closed", submissions: [sub("submitted"), sub("submitted")] },
    ];

    const ind = computeInstructionalIndicators({ unitPlans, lessonPlans, sessions, assignments });

    expect(ind.unitsPlanned).toBe(2);
    expect(ind.lessonsPlanned).toBe(3);
    expect(ind.lessonsApproved).toBe(2);
    expect(ind.sessionsScheduled).toBe(1);
    expect(ind.sessionsDelivered).toBe(2);
    expect(ind.sessionsCompleted).toBe(1);
    expect(ind.assignmentsPublished).toBe(2);

    // targeted distinct outcomes {o1,o2,o3,o4} = 4; covered by approved lessons {o1,o2,o3} = 3
    expect(ind.outcomesTargeted).toBe(4);
    expect(ind.outcomesCovered).toBe(3);
    expect(ind.curriculumCoverage).toBe(75);

    // completed 1 over non-cancelled 3
    expect(ind.lessonCompletionRate).toBe(33.33);
    // S1 2/2=1, S2 2/4=0.5 → avg 0.75
    expect(ind.teachingConsistency).toBe(75);
    // engaged 42 over expected 60
    expect(ind.studentEngagement).toBe(70);
    // delivered 2 over lessonsPlanned 3
    expect(ind.learningPace).toBe(66.67);
    // resources 2 + 1 over 2 delivered sessions
    expect(ind.resourceUtilization).toBe(1.5);
    // submitted+late 4 over 5 tracked
    expect(ind.submissionRate).toBe(80);
    // lessons 3 + sessions 4 + assignments 3
    expect(ind.instructionalWorkload).toBe(10);
  });

  it("excludes archived unit-plan outcomes from the coverage target", () => {
    const ind = computeInstructionalIndicators({
      unitPlans: [
        {
          status: "archived",
          learningOutcomeIds: [id("o1"), id("o2")],
          estimatedInstructionalHours: 5,
        },
        { status: "active", learningOutcomeIds: [id("o3")], estimatedInstructionalHours: 5 },
      ],
      lessonPlans: [{ status: "approved", learningOutcomeIds: [id("o3")] }],
    });
    // only o3 is targeted (o1/o2 archived); it is covered → 100%
    expect(ind.outcomesTargeted).toBe(1);
    expect(ind.curriculumCoverage).toBe(100);
  });
});
