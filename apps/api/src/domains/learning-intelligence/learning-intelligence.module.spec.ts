import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { CohortInsightController } from "./cohort-insight.controller";
import { EarlyWarningController } from "./early-warning.controller";
import { EducationalInsightController } from "./educational-insight.controller";
import { GrowthPlanController } from "./growth-plan.controller";
import { LearnerInsightProfileController } from "./learner-insight-profile.controller";
import { LearningIntelligenceModule } from "./learning-intelligence.module";
import {
  LI_COHORT_SERVICE,
  LI_EARLY_WARNING_SERVICE,
  LI_GROWTH_PLAN_SERVICE,
  LI_INSIGHT_SERVICE,
  LI_PROFILE_SERVICE,
  LI_RECOMMENDATION_SERVICE,
  LI_SIGNAL_SERVICE,
} from "./learning-intelligence.tokens";
import { LearningSignalController } from "./learning-signal.controller";
import { RecommendationController } from "./recommendation.controller";

/**
 * Stands in for the global platform providers (database handle, event bus) that the domain modules
 * inject, so the learning-intelligence DI graph — including the imported Organization and
 * Student-Lifecycle modules — can compile without a live database. The Prisma adapters only store
 * the handle at construction.
 */
@Global()
@Module({
  providers: [
    { provide: DATABASE, useValue: {} },
    { provide: EVENT_BUS, useValue: { publish: async () => undefined } },
  ],
  exports: [DATABASE, EVENT_BUS],
})
class MockGlobalsModule {}

describe("LearningIntelligenceModule (integration)", () => {
  it("compiles the full learning-intelligence DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, LearningIntelligenceModule],
    }).compile();

    expect(moduleRef.get(LearningSignalController)).toBeInstanceOf(LearningSignalController);
    expect(moduleRef.get(LearnerInsightProfileController)).toBeInstanceOf(
      LearnerInsightProfileController,
    );
    expect(moduleRef.get(EarlyWarningController)).toBeInstanceOf(EarlyWarningController);
    expect(moduleRef.get(EducationalInsightController)).toBeInstanceOf(
      EducationalInsightController,
    );
    expect(moduleRef.get(RecommendationController)).toBeInstanceOf(RecommendationController);
    expect(moduleRef.get(GrowthPlanController)).toBeInstanceOf(GrowthPlanController);
    expect(moduleRef.get(CohortInsightController)).toBeInstanceOf(CohortInsightController);

    await moduleRef.close();
  });

  it("exposes each aggregate's application service for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, LearningIntelligenceModule],
    }).compile();

    for (const token of [
      LI_SIGNAL_SERVICE,
      LI_PROFILE_SERVICE,
      LI_EARLY_WARNING_SERVICE,
      LI_INSIGHT_SERVICE,
      LI_RECOMMENDATION_SERVICE,
      LI_GROWTH_PLAN_SERVICE,
      LI_COHORT_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
