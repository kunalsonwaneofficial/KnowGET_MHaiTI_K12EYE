import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { CommitteeController } from "./committee.controller";
import { DelegationController } from "./delegation.controller";
import { GovernanceApprovalController } from "./governance-approval.controller";
import { GovernanceBodyController } from "./governance-body.controller";
import { GovernanceCalendarController } from "./governance-calendar.controller";
import { GovernanceModule } from "./governance.module";
import {
  GOVERNANCE_APPROVAL_SERVICE,
  GOVERNANCE_BODY_SERVICE,
  GOVERNANCE_CALENDAR_SERVICE,
  GOVERNANCE_COMMITTEE_SERVICE,
  GOVERNANCE_DELEGATION_SERVICE,
  GOVERNANCE_POLICY_SERVICE,
  GOVERNANCE_RESOLUTION_SERVICE,
} from "./governance.tokens";
import { PolicyController } from "./policy.controller";
import { ResolutionController } from "./resolution.controller";

/**
 * Stands in for the global platform providers (database handle, event bus) that
 * the domain modules inject, so the governance DI graph can be compiled without a
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

describe("GovernanceModule (integration)", () => {
  it("compiles the full governance DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, GovernanceModule],
    }).compile();

    expect(moduleRef.get(GovernanceBodyController)).toBeInstanceOf(GovernanceBodyController);
    expect(moduleRef.get(CommitteeController)).toBeInstanceOf(CommitteeController);
    expect(moduleRef.get(PolicyController)).toBeInstanceOf(PolicyController);
    expect(moduleRef.get(DelegationController)).toBeInstanceOf(DelegationController);
    expect(moduleRef.get(ResolutionController)).toBeInstanceOf(ResolutionController);
    expect(moduleRef.get(GovernanceCalendarController)).toBeInstanceOf(
      GovernanceCalendarController,
    );
    expect(moduleRef.get(GovernanceApprovalController)).toBeInstanceOf(
      GovernanceApprovalController,
    );

    await moduleRef.close();
  });

  it("exposes each aggregate's application service for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, GovernanceModule],
    }).compile();

    for (const token of [
      GOVERNANCE_BODY_SERVICE,
      GOVERNANCE_COMMITTEE_SERVICE,
      GOVERNANCE_POLICY_SERVICE,
      GOVERNANCE_DELEGATION_SERVICE,
      GOVERNANCE_RESOLUTION_SERVICE,
      GOVERNANCE_CALENDAR_SERVICE,
      GOVERNANCE_APPROVAL_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
