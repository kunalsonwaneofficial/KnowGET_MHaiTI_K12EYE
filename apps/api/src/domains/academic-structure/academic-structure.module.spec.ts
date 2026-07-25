import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { AcademicCalendarController } from "./academic-calendar.controller";
import { AcademicClassController } from "./academic-class.controller";
import { AcademicProgramController } from "./academic-program.controller";
import { AcademicStructureModule } from "./academic-structure.module";
import {
  AS_CALENDAR_SERVICE,
  AS_CLASS_SERVICE,
  AS_CURRICULUM_SERVICE,
  AS_GRADE_SERVICE,
  AS_LEARNING_OUTCOME_SERVICE,
  AS_PROGRAM_SERVICE,
  AS_SECTION_SERVICE,
  AS_SUBJECT_SERVICE,
} from "./academic-structure.tokens";
import { CurriculumFrameworkController } from "./curriculum-framework.controller";
import { GradeController } from "./grade.controller";
import { LearningOutcomeController } from "./learning-outcome.controller";
import { SectionController } from "./section.controller";
import { SubjectController } from "./subject.controller";

/**
 * Stands in for the global platform providers (database handle, event bus) that the
 * domain modules inject, so the academic-structure DI graph — including the imported
 * Organization module — can be compiled without a live database. The Prisma adapters only
 * store the handle at construction.
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

describe("AcademicStructureModule (integration)", () => {
  it("compiles the full academic-structure DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, AcademicStructureModule],
    }).compile();

    expect(moduleRef.get(AcademicCalendarController)).toBeInstanceOf(AcademicCalendarController);
    expect(moduleRef.get(AcademicProgramController)).toBeInstanceOf(AcademicProgramController);
    expect(moduleRef.get(CurriculumFrameworkController)).toBeInstanceOf(
      CurriculumFrameworkController,
    );
    expect(moduleRef.get(GradeController)).toBeInstanceOf(GradeController);
    expect(moduleRef.get(AcademicClassController)).toBeInstanceOf(AcademicClassController);
    expect(moduleRef.get(SectionController)).toBeInstanceOf(SectionController);
    expect(moduleRef.get(SubjectController)).toBeInstanceOf(SubjectController);
    expect(moduleRef.get(LearningOutcomeController)).toBeInstanceOf(LearningOutcomeController);

    await moduleRef.close();
  });

  it("exposes each aggregate's application service for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, AcademicStructureModule],
    }).compile();

    for (const token of [
      AS_CALENDAR_SERVICE,
      AS_PROGRAM_SERVICE,
      AS_CURRICULUM_SERVICE,
      AS_GRADE_SERVICE,
      AS_CLASS_SERVICE,
      AS_SECTION_SERVICE,
      AS_SUBJECT_SERVICE,
      AS_LEARNING_OUTCOME_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
