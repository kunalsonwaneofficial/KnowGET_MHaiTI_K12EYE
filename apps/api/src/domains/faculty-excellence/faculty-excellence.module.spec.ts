import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { CoachingEngagementController } from "./coaching-engagement.controller";
import { CoachingSessionController } from "./coaching-session.controller";
import { CompetencyFrameworkController } from "./competency-framework.controller";
import { DevelopmentController } from "./development.controller";
import { DevelopmentGoalController } from "./development-goal.controller";
import { FacultyExcellenceModule } from "./faculty-excellence.module";
import {
  FE_DEVELOPMENT_SERVICE,
  FE_ENGAGEMENT_SERVICE,
  FE_FRAMEWORK_SERVICE,
  FE_GOAL_SERVICE,
  FE_OBSERVATION_SERVICE,
  FE_PROFILE_SERVICE,
  FE_SESSION_SERVICE,
} from "./faculty-excellence.tokens";
import { FacultyProfileController } from "./faculty-profile.controller";
import { ObservationController } from "./observation.controller";

/**
 * Stands in for the global platform providers (database handle, event bus) that the domain modules
 * inject, so the faculty-excellence DI graph — including the imported Organization and Workforce
 * modules — can compile without a live database. The Prisma adapters only store the handle at
 * construction.
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

describe("FacultyExcellenceModule (integration)", () => {
  it("compiles the full faculty-excellence DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, FacultyExcellenceModule],
    }).compile();

    expect(moduleRef.get(CompetencyFrameworkController)).toBeInstanceOf(
      CompetencyFrameworkController,
    );
    expect(moduleRef.get(ObservationController)).toBeInstanceOf(ObservationController);
    expect(moduleRef.get(CoachingEngagementController)).toBeInstanceOf(
      CoachingEngagementController,
    );
    expect(moduleRef.get(CoachingSessionController)).toBeInstanceOf(CoachingSessionController);
    expect(moduleRef.get(DevelopmentController)).toBeInstanceOf(DevelopmentController);
    expect(moduleRef.get(DevelopmentGoalController)).toBeInstanceOf(DevelopmentGoalController);
    expect(moduleRef.get(FacultyProfileController)).toBeInstanceOf(FacultyProfileController);

    await moduleRef.close();
  });

  it("exposes each aggregate's application service for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, FacultyExcellenceModule],
    }).compile();

    for (const token of [
      FE_FRAMEWORK_SERVICE,
      FE_OBSERVATION_SERVICE,
      FE_ENGAGEMENT_SERVICE,
      FE_SESSION_SERVICE,
      FE_DEVELOPMENT_SERVICE,
      FE_GOAL_SERVICE,
      FE_PROFILE_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
