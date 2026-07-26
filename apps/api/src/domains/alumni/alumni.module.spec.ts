import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { AlumniChapterController } from "./alumni-chapter.controller";
import { AlumniEngagementProfileController } from "./alumni-engagement-profile.controller";
import { AlumniEventController } from "./alumni-event.controller";
import { AlumniModule } from "./alumni.module";
import {
  AL_CHAPTER_SERVICE,
  AL_CONTRIBUTION_SERVICE,
  AL_ENGAGEMENT_PROFILE_SERVICE,
  AL_EVENT_SERVICE,
  AL_MEMBERSHIP_SERVICE,
  AL_MENTORSHIP_SERVICE,
  AL_PROFILE_SERVICE,
  AL_REGISTRATION_SERVICE,
} from "./alumni.tokens";
import { AlumniProfileController } from "./alumni-profile.controller";
import { ChapterMembershipController } from "./chapter-membership.controller";
import { ContributionController } from "./contribution.controller";
import { EventRegistrationController } from "./event-registration.controller";
import { MentorshipConnectionController } from "./mentorship-connection.controller";

/**
 * Stands in for the global platform providers (database handle, event bus) the domain modules inject, so the
 * alumni DI graph — including the imported Organization and Person modules — compiles without a live database.
 * The Prisma adapters only store the handle at construction.
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

describe("AlumniModule (integration)", () => {
  it("compiles the full alumni DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, AlumniModule],
    }).compile();

    expect(moduleRef.get(AlumniProfileController)).toBeInstanceOf(AlumniProfileController);
    expect(moduleRef.get(AlumniChapterController)).toBeInstanceOf(AlumniChapterController);
    expect(moduleRef.get(ChapterMembershipController)).toBeInstanceOf(ChapterMembershipController);
    expect(moduleRef.get(AlumniEventController)).toBeInstanceOf(AlumniEventController);
    expect(moduleRef.get(EventRegistrationController)).toBeInstanceOf(EventRegistrationController);
    expect(moduleRef.get(MentorshipConnectionController)).toBeInstanceOf(
      MentorshipConnectionController,
    );
    expect(moduleRef.get(ContributionController)).toBeInstanceOf(ContributionController);
    expect(moduleRef.get(AlumniEngagementProfileController)).toBeInstanceOf(
      AlumniEngagementProfileController,
    );

    await moduleRef.close();
  });

  it("exposes each aggregate's application service (and the engagement-profile spine) for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, AlumniModule],
    }).compile();

    for (const token of [
      AL_PROFILE_SERVICE,
      AL_CHAPTER_SERVICE,
      AL_MEMBERSHIP_SERVICE,
      AL_EVENT_SERVICE,
      AL_REGISTRATION_SERVICE,
      AL_MENTORSHIP_SERVICE,
      AL_CONTRIBUTION_SERVICE,
      AL_ENGAGEMENT_PROFILE_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
