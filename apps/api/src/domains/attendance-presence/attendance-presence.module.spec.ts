import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { AttendanceAnalyticsController } from "./attendance-analytics.controller";
import { AttendancePolicyController } from "./attendance-policy.controller";
import { AttendancePresenceModule } from "./attendance-presence.module";
import {
  AP_EVALUATION_SERVICE,
  AP_LEAVE_SERVICE,
  AP_PARTICIPATION_SERVICE,
  AP_POLICY_SERVICE,
  AP_PROFILE_SERVICE,
  AP_RECORD_SERVICE,
  AP_SESSION_SERVICE,
} from "./attendance-presence.tokens";
import { AttendanceRecordController } from "./attendance-record.controller";
import { AttendanceSessionController } from "./attendance-session.controller";
import { LeaveController } from "./leave.controller";
import { ParticipationController } from "./participation.controller";
import { PresenceProfileController } from "./presence-profile.controller";

/**
 * Stands in for the global platform providers (database handle, event bus) that the domain
 * modules inject, so the attendance-presence DI graph — including the imported Organization,
 * Person, Academic-Scheduling and Academic-Structure modules — can compile without a live
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

describe("AttendancePresenceModule (integration)", () => {
  it("compiles the full attendance-presence DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, AttendancePresenceModule],
    }).compile();

    expect(moduleRef.get(AttendanceSessionController)).toBeInstanceOf(AttendanceSessionController);
    expect(moduleRef.get(AttendanceRecordController)).toBeInstanceOf(AttendanceRecordController);
    expect(moduleRef.get(LeaveController)).toBeInstanceOf(LeaveController);
    expect(moduleRef.get(AttendancePolicyController)).toBeInstanceOf(AttendancePolicyController);
    expect(moduleRef.get(PresenceProfileController)).toBeInstanceOf(PresenceProfileController);
    expect(moduleRef.get(ParticipationController)).toBeInstanceOf(ParticipationController);
    expect(moduleRef.get(AttendanceAnalyticsController)).toBeInstanceOf(
      AttendanceAnalyticsController,
    );

    await moduleRef.close();
  });

  it("exposes each aggregate's application service for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, AttendancePresenceModule],
    }).compile();

    for (const token of [
      AP_SESSION_SERVICE,
      AP_RECORD_SERVICE,
      AP_LEAVE_SERVICE,
      AP_POLICY_SERVICE,
      AP_PROFILE_SERVICE,
      AP_PARTICIPATION_SERVICE,
      AP_EVALUATION_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
