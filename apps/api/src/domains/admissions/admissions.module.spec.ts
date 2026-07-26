import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { AdmissionCycleController } from "./admission-cycle.controller";
import { AdmissionEvaluationController } from "./admission-evaluation.controller";
import { AdmissionsFunnelProfileController } from "./admissions-funnel-profile.controller";
import { AdmissionsModule } from "./admissions.module";
import {
  AD_APPLICATION_SERVICE,
  AD_CAMPAIGN_SERVICE,
  AD_CYCLE_SERVICE,
  AD_ENROLLMENT_SERVICE,
  AD_EVALUATION_SERVICE,
  AD_LEAD_SERVICE,
  AD_OFFER_SERVICE,
  AD_PROFILE_SERVICE,
} from "./admissions.tokens";
import { ApplicationController } from "./application.controller";
import { EnrollmentConfirmationController } from "./enrollment-confirmation.controller";
import { LeadController } from "./lead.controller";
import { MarketingCampaignController } from "./marketing-campaign.controller";
import { OfferController } from "./offer.controller";

/**
 * Stands in for the global platform providers (database handle, event bus) the domain modules inject, so the
 * admissions DI graph — including the imported Organization and Person modules — compiles without a live
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

describe("AdmissionsModule (integration)", () => {
  it("compiles the full admissions DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, AdmissionsModule],
    }).compile();

    expect(moduleRef.get(MarketingCampaignController)).toBeInstanceOf(MarketingCampaignController);
    expect(moduleRef.get(LeadController)).toBeInstanceOf(LeadController);
    expect(moduleRef.get(AdmissionCycleController)).toBeInstanceOf(AdmissionCycleController);
    expect(moduleRef.get(ApplicationController)).toBeInstanceOf(ApplicationController);
    expect(moduleRef.get(AdmissionEvaluationController)).toBeInstanceOf(
      AdmissionEvaluationController,
    );
    expect(moduleRef.get(OfferController)).toBeInstanceOf(OfferController);
    expect(moduleRef.get(EnrollmentConfirmationController)).toBeInstanceOf(
      EnrollmentConfirmationController,
    );
    expect(moduleRef.get(AdmissionsFunnelProfileController)).toBeInstanceOf(
      AdmissionsFunnelProfileController,
    );

    await moduleRef.close();
  });

  it("exposes each aggregate's application service (and the funnel-profile spine) for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, AdmissionsModule],
    }).compile();

    for (const token of [
      AD_CAMPAIGN_SERVICE,
      AD_LEAD_SERVICE,
      AD_CYCLE_SERVICE,
      AD_APPLICATION_SERVICE,
      AD_EVALUATION_SERVICE,
      AD_OFFER_SERVICE,
      AD_ENROLLMENT_SERVICE,
      AD_PROFILE_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
