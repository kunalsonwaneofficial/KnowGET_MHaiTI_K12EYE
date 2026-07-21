import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { CommunicationProfileController } from "./communication-profile.controller";
import { ConsentController } from "./consent.controller";
import { EmergencyContactController } from "./emergency-contact.controller";
import { FamilyController } from "./family.controller";
import { FamilyGuardianModule } from "./family-guardian.module";
import { FamilyIntelligenceProfileController } from "./family-intelligence-profile.controller";
import { GuardianController } from "./guardian.controller";
import { StudentGuardianRelationshipController } from "./student-guardian-relationship.controller";
import {
  FAMILY_SERVICE,
  FG_COMMUNICATION_PROFILE_SERVICE,
  FG_CONSENT_SERVICE,
  FG_EMERGENCY_CONTACT_SERVICE,
  FG_INTELLIGENCE_PROFILE_SERVICE,
  FG_RELATIONSHIP_SERVICE,
  GUARDIAN_SERVICE,
} from "./family-guardian.tokens";

/**
 * Stands in for the global platform providers (database handle, event bus) that the
 * domain modules inject, so the family-guardian DI graph — including the imported
 * Person, Organization, Student-Lifecycle and Governance modules — can be compiled
 * without a live database. The Prisma adapters only store the handle at construction.
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

describe("FamilyGuardianModule (integration)", () => {
  it("compiles the full family-guardian DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, FamilyGuardianModule],
    }).compile();

    expect(moduleRef.get(FamilyController)).toBeInstanceOf(FamilyController);
    expect(moduleRef.get(GuardianController)).toBeInstanceOf(GuardianController);
    expect(moduleRef.get(StudentGuardianRelationshipController)).toBeInstanceOf(
      StudentGuardianRelationshipController,
    );
    expect(moduleRef.get(ConsentController)).toBeInstanceOf(ConsentController);
    expect(moduleRef.get(EmergencyContactController)).toBeInstanceOf(EmergencyContactController);
    expect(moduleRef.get(CommunicationProfileController)).toBeInstanceOf(
      CommunicationProfileController,
    );
    expect(moduleRef.get(FamilyIntelligenceProfileController)).toBeInstanceOf(
      FamilyIntelligenceProfileController,
    );

    await moduleRef.close();
  });

  it("exposes each aggregate's application service for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, FamilyGuardianModule],
    }).compile();

    for (const token of [
      FAMILY_SERVICE,
      GUARDIAN_SERVICE,
      FG_RELATIONSHIP_SERVICE,
      FG_CONSENT_SERVICE,
      FG_EMERGENCY_CONTACT_SERVICE,
      FG_COMMUNICATION_PROFILE_SERVICE,
      FG_INTELLIGENCE_PROFILE_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
