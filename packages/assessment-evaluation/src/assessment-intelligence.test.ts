import { describe, expect, it } from "vitest";
import type { Uuid } from "@knowget/types";
import { computeAssessmentIndicators } from "./assessment-intelligence";
import type { AssessmentView, CompetencyMasteryView, EvaluationView } from "./assessment-view";

const id = (s: string): Uuid => s as Uuid;

describe("assessment-intelligence", () => {
  it("returns all-zero indicators for an empty scope", () => {
    const ind = computeAssessmentIndicators({});
    expect(ind.assessmentsPublished).toBe(0);
    expect(ind.evaluationApprovalRate).toBe(0);
    expect(ind.averagePerformance).toBe(0);
    expect(ind.competencyMastery).toBe(0);
    expect(ind.curriculumCoverage).toBe(0);
    // no evaluations → consistency is vacuously 100
    expect(ind.performanceConsistency).toBe(100);
  });

  it("computes performance, approval, mastery and coverage indicators", () => {
    const assessments: AssessmentView[] = [
      { status: "completed", learningOutcomeIds: [id("o1"), id("o2")] },
      { status: "completed", learningOutcomeIds: [id("o2"), id("o3")] },
      { status: "published", learningOutcomeIds: [id("o4")] },
      { status: "draft", learningOutcomeIds: [id("o5")] },
      { status: "cancelled", learningOutcomeIds: [id("o6")] },
    ];
    const evaluations: EvaluationView[] = [
      { status: "approved", percentage: 70 },
      { status: "approved", percentage: 90 },
      { status: "submitted", percentage: null },
    ];
    const competencies: CompetencyMasteryView[] = [
      { masteryLevel: "mastered" },
      { masteryLevel: "proficient" },
      { masteryLevel: "developing" },
      { masteryLevel: "not_assessed" },
    ];

    const ind = computeAssessmentIndicators({ assessments, evaluations, competencies });

    // 3 non-draft/non-cancelled published+, 2 completed
    expect(ind.assessmentsPublished).toBe(3);
    expect(ind.assessmentsCompleted).toBe(2);

    // 2 approved of 3
    expect(ind.evaluationsTotal).toBe(3);
    expect(ind.evaluationsApproved).toBe(2);
    expect(ind.evaluationApprovalRate).toBe(66.67);

    // percentages [70, 90] → mean 80, stdev 10 → consistency 90
    expect(ind.averagePerformance).toBe(80);
    expect(ind.performanceConsistency).toBe(90);

    // mastered + proficient = 2 of 4; scores (1 + 0.6 + 0.4 + 0)/4 = 0.5 → 50%
    expect(ind.competenciesTracked).toBe(4);
    expect(ind.masteredCompetencies).toBe(2);
    expect(ind.learningGaps).toBe(2);
    expect(ind.competencyMastery).toBe(50);

    // targeted {o1,o2,o3,o4} = 4; covered by completed {o1,o2,o3} = 3 → 75%
    expect(ind.outcomesTargeted).toBe(4);
    expect(ind.outcomesCovered).toBe(3);
    expect(ind.curriculumCoverage).toBe(75);
  });
});
