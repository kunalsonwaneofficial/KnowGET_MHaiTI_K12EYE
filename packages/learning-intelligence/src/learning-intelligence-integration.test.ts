import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { CohortInsightService } from "./cohort-insight-service";
import { DEFAULT_EARLY_WARNING_RULES, evaluateEarlyWarnings } from "./early-warning-rules";
import { EarlyWarningService } from "./early-warning-service";
import { EducationalInsightService } from "./educational-insight-service";
import { GrowthPlanService } from "./growth-plan-service";
import { LearnerInsightProfileService } from "./learner-insight-profile-service";
import { LearningSignalService } from "./learning-signal-service";
import { needsAttention } from "./insight-value";
import {
  InMemoryCohortInsightRepository,
  InMemoryEarlyWarningRepository,
  InMemoryEducationalInsightRepository,
  InMemoryGrowthPlanRepository,
  InMemoryLearnerInsightProfileRepository,
  InMemoryLearningSignalRepository,
  InMemoryRecommendationRepository,
  type OrganizationDirectory,
  type StudentDirectory,
} from "./ports";
import { RecommendationService } from "./recommendation-service";

const TENANT = "t1" as TenantId;
const ORG = "org-1" as Uuid;
const STUDENT = "stu-1" as Uuid;
const TEACHER = "teacher-1" as Uuid;

const allow = (allowed: readonly string[]) => ({
  exists: async (_t: TenantId, id: Uuid) => allowed.includes(id),
});

/**
 * End-to-end: ingest cross-domain signals for a learner, synthesize their unified insight profile,
 * fire an explainable early warning from the synthesized scores, propose and publish an insight,
 * propose a recommendation and have a human accept and action it, turn it into a growth plan worked
 * to achievement, and roll the learner up into a cohort insight — proving the descriptive
 * intelligence pipeline is consistent and explainable from signal to cohort, with no prediction
 * anywhere and every warning/insight/recommendation carrying evidence.
 */
describe("learning-intelligence integration", () => {
  it("synthesizes, warns, recommends, plans and rolls up consistently", async () => {
    const organizations = allow([ORG]) as OrganizationDirectory;
    const students = allow([STUDENT]) as StudentDirectory;

    const signalRepo = new InMemoryLearningSignalRepository();
    const profileRepo = new InMemoryLearnerInsightProfileRepository();
    const warningRepo = new InMemoryEarlyWarningRepository();
    const insightRepo = new InMemoryEducationalInsightRepository();
    const recRepo = new InMemoryRecommendationRepository();
    const planRepo = new InMemoryGrowthPlanRepository();
    const cohortRepo = new InMemoryCohortInsightRepository();

    const signals = new LearningSignalService({ repository: signalRepo, organizations, students });
    const profiles = new LearnerInsightProfileService({
      repository: profileRepo,
      signals: signalRepo,
      organizations,
      students,
    });
    const warnings = new EarlyWarningService({ repository: warningRepo, organizations, students });
    const insights = new EducationalInsightService({
      repository: insightRepo,
      organizations,
      students,
    });
    const recommendations = new RecommendationService({
      repository: recRepo,
      organizations,
      students,
    });
    const plans = new GrowthPlanService({ repository: planRepo, organizations, students });
    const cohorts = new CohortInsightService({
      repository: cohortRepo,
      profiles: profileRepo,
      organizations,
    });

    // 1. Ingest cross-domain signals (academic weak, attendance weak, engagement mid).
    const evidence = {
      source: "assessment_evaluation" as const,
      kind: "analytics",
      ref: null,
      detail: null,
    };
    for (const [dimension, source, value] of [
      ["academic", "assessment_evaluation", 35],
      ["attendance", "attendance_presence", 45],
      ["engagement", "teaching_learning", 70],
    ] as const) {
      await signals.capture({
        tenantId: TENANT,
        organizationId: ORG,
        studentId: STUDENT,
        dimension,
        source,
        metric: "health",
        value,
        evidence: { ...evidence, source },
      });
    }

    // 2. Synthesize the unified profile.
    const profile = await profiles.refreshForStudent(TENANT, ORG, STUDENT);
    expect(profile.status).toBe("synthesized");
    expect(profile.dimensionsCovered).toBe(3);
    // (35 + 45 + 70) / 3 = 50 → watch
    expect(profile.overallScore).toBe(50);
    const academic = profile.dimensions.find((d) => d.dimension === "academic");
    expect(academic?.band).toBe("at_risk"); // 35 < 50

    // 3. Fire an explainable early warning from the synthesized scores, then raise it.
    const fired = evaluateEarlyWarnings(profile.dimensions, DEFAULT_EARLY_WARNING_RULES);
    const academicWarning = fired.find((f) => f.dimension === "academic");
    expect(academicWarning?.ruleId).toBe("academic-at-risk");

    const warning = await warnings.raise({
      tenantId: TENANT,
      organizationId: ORG,
      studentId: STUDENT,
      dimension: academicWarning!.dimension,
      ruleId: academicWarning!.ruleId,
      severity: academicWarning!.severity,
      observedScore: academicWarning!.observedScore,
      rationale: `Academic health ${academicWarning!.observedScore} tripped ${academicWarning!.ruleId}.`,
      evidence: [evidence],
    });
    expect(warning.status).toBe("raised");

    // 4. Publish an educational insight grounded in the evidence.
    const insight = await insights.propose({
      tenantId: TENANT,
      organizationId: ORG,
      studentId: STUDENT,
      category: "gap",
      dimension: "academic",
      title: "Emerging maths gap",
      narrative: "Academic health at_risk while attendance also dips — likely coverage loss.",
      priority: "high",
      evidence: [evidence],
    });
    const published = await insights.publish(TENANT, insight.id);
    expect(published.status).toBe("published");

    // 5. Propose a recommendation; a human accepts and actions it.
    const rec = await recommendations.propose({
      tenantId: TENANT,
      organizationId: ORG,
      studentId: STUDENT,
      category: "instructional_support",
      action: "Targeted maths support twice weekly.",
      rationale: "Addresses the academic gap with attendance recovery.",
      targetDimension: "academic",
      evidence: [evidence],
    });
    await recommendations.accept(TENANT, rec.id, TEACHER);
    const actioned = await recommendations.action(TENANT, rec.id, TEACHER);
    expect(actioned.status).toBe("actioned");

    // 6. Turn it into a growth plan worked to achievement.
    const plan = await plans.create({
      tenantId: TENANT,
      organizationId: ORG,
      studentId: STUDENT,
      title: "Maths recovery",
      focusDimension: "academic",
      goals: [{ description: "Reach 60% on the next unit test", targetDimension: "academic" }],
      sourceRecommendationIds: [rec.id],
    });
    await plans.activate(TENANT, plan.id, TEACHER);
    await plans.recordGoalOutcome(TENANT, plan.id, plan.goals[0]!.id, "met");
    const achieved = await plans.achieve(TENANT, plan.id, TEACHER);
    expect(achieved.status).toBe("achieved");
    expect(achieved.progressPercent).toBe(100);

    // 7. Roll the learner up into a cohort insight — the learner needs attention only if the
    //    profile band does, so the rollup and the profile agree.
    const cohort = await cohorts.create({
      tenantId: TENANT,
      organizationId: ORG,
      scopeType: "organization",
      scopeId: ORG,
      label: "Whole school",
    });
    const rolled = await cohorts.refresh(TENANT, cohort.id);
    expect(rolled.learnersConsidered).toBe(1);
    expect(rolled.averageLearningHealth).toBe(profile.overallScore);
    expect(rolled.learnersNeedingAttention).toBe(needsAttention(profile.overallBand) ? 1 : 0);
    expect(rolled.bandDistribution[profile.overallBand]).toBe(1);
  });
});
