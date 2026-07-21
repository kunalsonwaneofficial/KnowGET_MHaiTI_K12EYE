import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { BehaviourRecordController } from "./behaviour-record.controller";
import { CounsellingCaseController } from "./counselling-case.controller";
import { HealthRecordController } from "./health-record.controller";
import { InterventionPlanController } from "./intervention-plan.controller";
import { LearnerSupportPlanController } from "./learner-support-plan.controller";
import { LearnerWellbeingModule } from "./learner-wellbeing.module";
import { SafeguardingCaseController } from "./safeguarding-case.controller";
import { WellbeingProfileController } from "./wellbeing-profile.controller";
import {
  LW_BEHAVIOUR_RECORD_SERVICE,
  LW_COUNSELLING_CASE_SERVICE,
  LW_HEALTH_RECORD_SERVICE,
  LW_INTERVENTION_PLAN_SERVICE,
  LW_SAFEGUARDING_CASE_SERVICE,
  LW_SUPPORT_PLAN_SERVICE,
  LW_WELLBEING_PROFILE_SERVICE,
} from "./learner-wellbeing.tokens";

/**
 * Stands in for the global platform providers (database handle, event bus) that the
 * domain modules inject, so the learner-wellbeing DI graph — including the imported
 * Student-Lifecycle and Person modules — can be compiled without a live database. The
 * Prisma adapters only store the handle at construction.
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

describe("LearnerWellbeingModule (integration)", () => {
  it("compiles the full learner-wellbeing DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, LearnerWellbeingModule],
    }).compile();

    expect(moduleRef.get(WellbeingProfileController)).toBeInstanceOf(WellbeingProfileController);
    expect(moduleRef.get(HealthRecordController)).toBeInstanceOf(HealthRecordController);
    expect(moduleRef.get(BehaviourRecordController)).toBeInstanceOf(BehaviourRecordController);
    expect(moduleRef.get(CounsellingCaseController)).toBeInstanceOf(CounsellingCaseController);
    expect(moduleRef.get(SafeguardingCaseController)).toBeInstanceOf(SafeguardingCaseController);
    expect(moduleRef.get(LearnerSupportPlanController)).toBeInstanceOf(
      LearnerSupportPlanController,
    );
    expect(moduleRef.get(InterventionPlanController)).toBeInstanceOf(InterventionPlanController);

    await moduleRef.close();
  });

  it("exposes each aggregate's application service for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, LearnerWellbeingModule],
    }).compile();

    for (const token of [
      LW_WELLBEING_PROFILE_SERVICE,
      LW_HEALTH_RECORD_SERVICE,
      LW_BEHAVIOUR_RECORD_SERVICE,
      LW_COUNSELLING_CASE_SERVICE,
      LW_SAFEGUARDING_CASE_SERVICE,
      LW_SUPPORT_PLAN_SERVICE,
      LW_INTERVENTION_PLAN_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
