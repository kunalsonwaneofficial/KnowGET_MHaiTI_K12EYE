import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { AcademicRecordController } from "./academic-record.controller";
import { AssessmentAnalyticsController } from "./assessment-analytics.controller";
import { AssessmentFrameworkController } from "./assessment-framework.controller";
import { AssessmentPlanController } from "./assessment-plan.controller";
import { AssessmentController } from "./assessment.controller";
import { AssessmentEvaluationModule } from "./assessment-evaluation.module";
import {
  AE_ACADEMIC_RECORD_SERVICE,
  AE_ANALYTICS_SERVICE,
  AE_ASSESSMENT_SERVICE,
  AE_COMPETENCY_PROFILE_SERVICE,
  AE_EVALUATION_SERVICE,
  AE_FRAMEWORK_SERVICE,
  AE_PLAN_SERVICE,
  AE_QUESTION_BANK_SERVICE,
  AE_REPORTING_SERVICE,
} from "./assessment-evaluation.tokens";
import { CompetencyProfileController } from "./competency-profile.controller";
import { EvaluationController } from "./evaluation.controller";
import { QuestionBankController } from "./question-bank.controller";
import { ReportingController } from "./reporting.controller";

/**
 * Stands in for the global platform providers (database handle, event bus) that the domain
 * modules inject, so the assessment-evaluation DI graph — including the imported Organization,
 * Academic-Structure and Student-Lifecycle modules — can compile without a live database. The
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

describe("AssessmentEvaluationModule (integration)", () => {
  it("compiles the full assessment-evaluation DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, AssessmentEvaluationModule],
    }).compile();

    expect(moduleRef.get(AssessmentFrameworkController)).toBeInstanceOf(
      AssessmentFrameworkController,
    );
    expect(moduleRef.get(AssessmentPlanController)).toBeInstanceOf(AssessmentPlanController);
    expect(moduleRef.get(AssessmentController)).toBeInstanceOf(AssessmentController);
    expect(moduleRef.get(QuestionBankController)).toBeInstanceOf(QuestionBankController);
    expect(moduleRef.get(EvaluationController)).toBeInstanceOf(EvaluationController);
    expect(moduleRef.get(CompetencyProfileController)).toBeInstanceOf(CompetencyProfileController);
    expect(moduleRef.get(AcademicRecordController)).toBeInstanceOf(AcademicRecordController);
    expect(moduleRef.get(ReportingController)).toBeInstanceOf(ReportingController);
    expect(moduleRef.get(AssessmentAnalyticsController)).toBeInstanceOf(
      AssessmentAnalyticsController,
    );

    await moduleRef.close();
  });

  it("exposes each aggregate's application service for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, AssessmentEvaluationModule],
    }).compile();

    for (const token of [
      AE_FRAMEWORK_SERVICE,
      AE_PLAN_SERVICE,
      AE_ASSESSMENT_SERVICE,
      AE_QUESTION_BANK_SERVICE,
      AE_EVALUATION_SERVICE,
      AE_COMPETENCY_PROFILE_SERVICE,
      AE_ACADEMIC_RECORD_SERVICE,
      AE_REPORTING_SERVICE,
      AE_ANALYTICS_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
