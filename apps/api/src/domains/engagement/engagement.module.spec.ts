import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { AcknowledgementController } from "./acknowledgement.controller";
import { AnnouncementController } from "./announcement.controller";
import { AudienceController } from "./audience.controller";
import { EngagementModule } from "./engagement.module";
import {
  EN_ACKNOWLEDGEMENT_SERVICE,
  EN_ANNOUNCEMENT_SERVICE,
  EN_AUDIENCE_SERVICE,
  EN_MESSAGE_SERVICE,
  EN_PROFILE_SERVICE,
  EN_RESPONSE_SERVICE,
  EN_SURVEY_SERVICE,
  EN_THREAD_SERVICE,
} from "./engagement.tokens";
import { EngagementProfileController } from "./engagement-profile.controller";
import { MessageController } from "./message.controller";
import { MessageThreadController } from "./message-thread.controller";
import { SurveyController } from "./survey.controller";
import { SurveyResponseController } from "./survey-response.controller";

/**
 * Stands in for the global platform providers (database handle, event bus) the domain modules inject, so the
 * engagement DI graph — including the imported Organization and Person modules — compiles without a live
 * database. The Prisma adapters only store the handle at construction.
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

describe("EngagementModule (integration)", () => {
  it("compiles the full engagement DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, EngagementModule],
    }).compile();

    expect(moduleRef.get(AudienceController)).toBeInstanceOf(AudienceController);
    expect(moduleRef.get(AnnouncementController)).toBeInstanceOf(AnnouncementController);
    expect(moduleRef.get(AcknowledgementController)).toBeInstanceOf(AcknowledgementController);
    expect(moduleRef.get(MessageThreadController)).toBeInstanceOf(MessageThreadController);
    expect(moduleRef.get(MessageController)).toBeInstanceOf(MessageController);
    expect(moduleRef.get(SurveyController)).toBeInstanceOf(SurveyController);
    expect(moduleRef.get(SurveyResponseController)).toBeInstanceOf(SurveyResponseController);
    expect(moduleRef.get(EngagementProfileController)).toBeInstanceOf(EngagementProfileController);

    await moduleRef.close();
  });

  it("exposes each aggregate's application service (and the engagement-profile spine) for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, EngagementModule],
    }).compile();

    for (const token of [
      EN_AUDIENCE_SERVICE,
      EN_ANNOUNCEMENT_SERVICE,
      EN_ACKNOWLEDGEMENT_SERVICE,
      EN_THREAD_SERVICE,
      EN_MESSAGE_SERVICE,
      EN_SURVEY_SERVICE,
      EN_RESPONSE_SERVICE,
      EN_PROFILE_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
