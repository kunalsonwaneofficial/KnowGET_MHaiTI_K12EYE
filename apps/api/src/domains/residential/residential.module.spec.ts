import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { BedAllocationController } from "./bed-allocation.controller";
import { HostelController } from "./hostel.controller";
import { HostelInspectionController } from "./hostel-inspection.controller";
import { HostelOccupancyProfileController } from "./hostel-occupancy-profile.controller";
import { OutpassController } from "./outpass.controller";
import { ResidentialModule } from "./residential.module";
import {
  RS_ALLOCATION_SERVICE,
  RS_HOSTEL_SERVICE,
  RS_INSPECTION_SERVICE,
  RS_OCCUPANCY_SERVICE,
  RS_OUTPASS_SERVICE,
  RS_ROLL_CALL_SERVICE,
  RS_ROOM_SERVICE,
  RS_WARDEN_SERVICE,
} from "./residential.tokens";
import { RollCallController } from "./roll-call.controller";
import { RoomController } from "./room.controller";
import { WardenController } from "./warden.controller";

/**
 * Stands in for the global platform providers (database handle, event bus) the domain modules inject, so
 * the residential DI graph — including the imported Organization, Workforce and Student Lifecycle
 * modules — compiles without a live database. The Prisma adapters only store the handle at construction.
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

describe("ResidentialModule (integration)", () => {
  it("compiles the full residential DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, ResidentialModule],
    }).compile();

    expect(moduleRef.get(HostelController)).toBeInstanceOf(HostelController);
    expect(moduleRef.get(WardenController)).toBeInstanceOf(WardenController);
    expect(moduleRef.get(RoomController)).toBeInstanceOf(RoomController);
    expect(moduleRef.get(HostelInspectionController)).toBeInstanceOf(HostelInspectionController);
    expect(moduleRef.get(BedAllocationController)).toBeInstanceOf(BedAllocationController);
    expect(moduleRef.get(OutpassController)).toBeInstanceOf(OutpassController);
    expect(moduleRef.get(RollCallController)).toBeInstanceOf(RollCallController);
    expect(moduleRef.get(HostelOccupancyProfileController)).toBeInstanceOf(
      HostelOccupancyProfileController,
    );

    await moduleRef.close();
  });

  it("exposes each aggregate's application service for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, ResidentialModule],
    }).compile();

    for (const token of [
      RS_HOSTEL_SERVICE,
      RS_WARDEN_SERVICE,
      RS_ROOM_SERVICE,
      RS_ALLOCATION_SERVICE,
      RS_OUTPASS_SERVICE,
      RS_ROLL_CALL_SERVICE,
      RS_INSPECTION_SERVICE,
      RS_OCCUPANCY_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
