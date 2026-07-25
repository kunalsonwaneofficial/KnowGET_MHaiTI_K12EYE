import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { AcademicSchedulingModule } from "./academic-scheduling.module";
import {
  SCHED_ALLOCATION_SERVICE,
  SCHED_POLICY_SERVICE,
  SCHED_RESOURCE_SERVICE,
  SCHED_SLOT_SERVICE,
  SCHED_SUBSTITUTION_SERVICE,
  SCHED_TIMETABLE_SERVICE,
} from "./academic-scheduling.tokens";
import { AllocationController } from "./allocation.controller";
import { ResourceController } from "./resource.controller";
import { ScheduleSlotController } from "./schedule-slot.controller";
import { SchedulingPolicyController } from "./scheduling-policy.controller";
import { SubstitutionController } from "./substitution.controller";
import { TimetableController } from "./timetable.controller";

/**
 * Stands in for the global platform providers (database handle, event bus) that the domain
 * modules inject, so the academic-scheduling DI graph — including the imported Organization,
 * Academic-Structure and Person modules — can compile without a live database. The Prisma
 * adapters only store the handle at construction.
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

describe("AcademicSchedulingModule (integration)", () => {
  it("compiles the full academic-scheduling DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, AcademicSchedulingModule],
    }).compile();

    expect(moduleRef.get(TimetableController)).toBeInstanceOf(TimetableController);
    expect(moduleRef.get(ScheduleSlotController)).toBeInstanceOf(ScheduleSlotController);
    expect(moduleRef.get(ResourceController)).toBeInstanceOf(ResourceController);
    expect(moduleRef.get(AllocationController)).toBeInstanceOf(AllocationController);
    expect(moduleRef.get(SchedulingPolicyController)).toBeInstanceOf(SchedulingPolicyController);
    expect(moduleRef.get(SubstitutionController)).toBeInstanceOf(SubstitutionController);

    await moduleRef.close();
  });

  it("exposes each aggregate's application service for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, AcademicSchedulingModule],
    }).compile();

    for (const token of [
      SCHED_TIMETABLE_SERVICE,
      SCHED_SLOT_SERVICE,
      SCHED_RESOURCE_SERVICE,
      SCHED_ALLOCATION_SERVICE,
      SCHED_POLICY_SERVICE,
      SCHED_SUBSTITUTION_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
