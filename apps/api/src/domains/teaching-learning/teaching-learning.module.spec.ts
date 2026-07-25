import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { AcademicPlanController } from "./academic-plan.controller";
import { AssignmentController } from "./assignment.controller";
import { ClassroomSessionController } from "./classroom-session.controller";
import { InstructionalAnalyticsController } from "./instructional-analytics.controller";
import { LearningEvidenceController } from "./learning-evidence.controller";
import { LearningResourceController } from "./learning-resource.controller";
import { LessonPlanController } from "./lesson-plan.controller";
import { TeachingLearningModule } from "./teaching-learning.module";
import {
  TL_ACADEMIC_PLAN_SERVICE,
  TL_ANALYTICS_SERVICE,
  TL_ASSIGNMENT_SERVICE,
  TL_CLASSROOM_SESSION_SERVICE,
  TL_LEARNING_EVIDENCE_SERVICE,
  TL_LEARNING_RESOURCE_SERVICE,
  TL_LESSON_PLAN_SERVICE,
  TL_UNIT_PLAN_SERVICE,
} from "./teaching-learning.tokens";
import { UnitPlanController } from "./unit-plan.controller";

/**
 * Stands in for the global platform providers (database handle, event bus) that the domain
 * modules inject, so the teaching-learning DI graph — including the imported Organization,
 * Academic-Structure, Academic-Scheduling and Student-Lifecycle modules — can compile without a
 * live database. The Prisma adapters only store the handle at construction.
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

describe("TeachingLearningModule (integration)", () => {
  it("compiles the full teaching-learning DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, TeachingLearningModule],
    }).compile();

    expect(moduleRef.get(AcademicPlanController)).toBeInstanceOf(AcademicPlanController);
    expect(moduleRef.get(UnitPlanController)).toBeInstanceOf(UnitPlanController);
    expect(moduleRef.get(LessonPlanController)).toBeInstanceOf(LessonPlanController);
    expect(moduleRef.get(LearningResourceController)).toBeInstanceOf(LearningResourceController);
    expect(moduleRef.get(ClassroomSessionController)).toBeInstanceOf(ClassroomSessionController);
    expect(moduleRef.get(AssignmentController)).toBeInstanceOf(AssignmentController);
    expect(moduleRef.get(LearningEvidenceController)).toBeInstanceOf(LearningEvidenceController);
    expect(moduleRef.get(InstructionalAnalyticsController)).toBeInstanceOf(
      InstructionalAnalyticsController,
    );

    await moduleRef.close();
  });

  it("exposes each aggregate's application service for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, TeachingLearningModule],
    }).compile();

    for (const token of [
      TL_ACADEMIC_PLAN_SERVICE,
      TL_UNIT_PLAN_SERVICE,
      TL_LESSON_PLAN_SERVICE,
      TL_LEARNING_RESOURCE_SERVICE,
      TL_CLASSROOM_SESSION_SERVICE,
      TL_ASSIGNMENT_SERVICE,
      TL_LEARNING_EVIDENCE_SERVICE,
      TL_ANALYTICS_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
