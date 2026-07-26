import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { AccessController } from "./access.controller";
import { AccessCredentialController } from "./access-credential.controller";
import { AccessZoneController } from "./access-zone.controller";
import { CampusSecurityModule } from "./campus-security.module";
import {
  CS_ACCESS_DECISION_SERVICE,
  CS_ACCESS_EVENT_SERVICE,
  CS_CREDENTIAL_SERVICE,
  CS_DRILL_SERVICE,
  CS_INCIDENT_SERVICE,
  CS_PROFILE_SERVICE,
  CS_VISIT_SERVICE,
  CS_VISITOR_SERVICE,
  CS_ZONE_SERVICE,
} from "./campus-security.tokens";
import { EmergencyDrillController } from "./emergency-drill.controller";
import { SafetyProfileController } from "./safety-profile.controller";
import { SecurityIncidentController } from "./security-incident.controller";
import { VisitController } from "./visit.controller";
import { VisitorController } from "./visitor.controller";

/**
 * Stands in for the global platform providers (database handle, event bus) the domain modules inject, so the
 * campus-security DI graph — including the imported Organization, Person and Workforce modules — compiles
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

describe("CampusSecurityModule (integration)", () => {
  it("compiles the full campus-security DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, CampusSecurityModule],
    }).compile();

    expect(moduleRef.get(AccessZoneController)).toBeInstanceOf(AccessZoneController);
    expect(moduleRef.get(VisitorController)).toBeInstanceOf(VisitorController);
    expect(moduleRef.get(VisitController)).toBeInstanceOf(VisitController);
    expect(moduleRef.get(AccessCredentialController)).toBeInstanceOf(AccessCredentialController);
    expect(moduleRef.get(AccessController)).toBeInstanceOf(AccessController);
    expect(moduleRef.get(SecurityIncidentController)).toBeInstanceOf(SecurityIncidentController);
    expect(moduleRef.get(EmergencyDrillController)).toBeInstanceOf(EmergencyDrillController);
    expect(moduleRef.get(SafetyProfileController)).toBeInstanceOf(SafetyProfileController);

    await moduleRef.close();
  });

  it("exposes each aggregate's application service (and the access-decision spine) for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, CampusSecurityModule],
    }).compile();

    for (const token of [
      CS_ZONE_SERVICE,
      CS_VISITOR_SERVICE,
      CS_VISIT_SERVICE,
      CS_CREDENTIAL_SERVICE,
      CS_ACCESS_EVENT_SERVICE,
      CS_INCIDENT_SERVICE,
      CS_DRILL_SERVICE,
      CS_PROFILE_SERVICE,
      CS_ACCESS_DECISION_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
