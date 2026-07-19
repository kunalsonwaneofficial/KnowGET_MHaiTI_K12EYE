import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { ApplicantController } from "./applicant.controller";
import { EducationalJourneyController } from "./educational-journey.controller";
import { IntelligenceProfileController } from "./intelligence-profile.controller";
import { ProspectController } from "./prospect.controller";
import { StudentController } from "./student.controller";
import { StudentLifecycleModule } from "./student-lifecycle.module";
import {
  STUDENT_APPLICANT_SERVICE,
  STUDENT_INTELLIGENCE_SERVICE,
  STUDENT_JOURNEY_SERVICE,
  STUDENT_PROSPECT_SERVICE,
  STUDENT_SERVICE,
  STUDENT_TIMELINE_SERVICE,
} from "./student-lifecycle.tokens";
import { TimelineController } from "./timeline.controller";

/**
 * Stands in for the global platform providers (database handle, event bus) that the
 * domain modules inject, so the student-lifecycle DI graph can be compiled without a
 * live database. The Prisma adapters only store the handle at construction, so an
 * inert value is sufficient to exercise the wiring.
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

describe("StudentLifecycleModule (integration)", () => {
  it("compiles the full student-lifecycle DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, StudentLifecycleModule],
    }).compile();

    expect(moduleRef.get(ProspectController)).toBeInstanceOf(ProspectController);
    expect(moduleRef.get(ApplicantController)).toBeInstanceOf(ApplicantController);
    expect(moduleRef.get(StudentController)).toBeInstanceOf(StudentController);
    expect(moduleRef.get(EducationalJourneyController)).toBeInstanceOf(
      EducationalJourneyController,
    );
    expect(moduleRef.get(IntelligenceProfileController)).toBeInstanceOf(
      IntelligenceProfileController,
    );
    expect(moduleRef.get(TimelineController)).toBeInstanceOf(TimelineController);

    await moduleRef.close();
  });

  it("exposes each aggregate's application service for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, StudentLifecycleModule],
    }).compile();

    for (const token of [
      STUDENT_PROSPECT_SERVICE,
      STUDENT_APPLICANT_SERVICE,
      STUDENT_SERVICE,
      STUDENT_JOURNEY_SERVICE,
      STUDENT_INTELLIGENCE_SERVICE,
      STUDENT_TIMELINE_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
