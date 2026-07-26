import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { BuildingController } from "./building.controller";
import { ComfortAssessmentController } from "./comfort-assessment.controller";
import { ComfortPolicyController } from "./comfort-policy.controller";
import { EnvironmentReadingController } from "./environment-reading.controller";
import { FacilitiesModule } from "./facilities.module";
import {
  FAC_BUILDING_SERVICE,
  FAC_COMFORT_ASSESSMENT_SERVICE,
  FAC_MAINTENANCE_SERVICE,
  FAC_POLICY_SERVICE,
  FAC_PROFILE_SERVICE,
  FAC_READING_SERVICE,
  FAC_SENSOR_SERVICE,
  FAC_SPACE_SERVICE,
  FAC_SYSTEM_SERVICE,
} from "./facilities.tokens";
import { FacilityProfileController } from "./facility-profile.controller";
import { FacilitySystemController } from "./facility-system.controller";
import { MaintenanceOrderController } from "./maintenance-order.controller";
import { SensorController } from "./sensor.controller";
import { SpaceController } from "./space.controller";

/**
 * Stands in for the global platform providers (database handle, event bus) the domain modules inject, so the
 * facilities DI graph — including the imported Organization and Workforce modules — compiles without a live
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

describe("FacilitiesModule (integration)", () => {
  it("compiles the full facilities DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, FacilitiesModule],
    }).compile();

    expect(moduleRef.get(BuildingController)).toBeInstanceOf(BuildingController);
    expect(moduleRef.get(SpaceController)).toBeInstanceOf(SpaceController);
    expect(moduleRef.get(FacilitySystemController)).toBeInstanceOf(FacilitySystemController);
    expect(moduleRef.get(MaintenanceOrderController)).toBeInstanceOf(MaintenanceOrderController);
    expect(moduleRef.get(FacilityProfileController)).toBeInstanceOf(FacilityProfileController);
    expect(moduleRef.get(SensorController)).toBeInstanceOf(SensorController);
    expect(moduleRef.get(EnvironmentReadingController)).toBeInstanceOf(
      EnvironmentReadingController,
    );
    expect(moduleRef.get(ComfortPolicyController)).toBeInstanceOf(ComfortPolicyController);
    expect(moduleRef.get(ComfortAssessmentController)).toBeInstanceOf(ComfortAssessmentController);

    await moduleRef.close();
  });

  it("exposes each aggregate's application service (and the comfort spine) for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, FacilitiesModule],
    }).compile();

    for (const token of [
      FAC_BUILDING_SERVICE,
      FAC_SPACE_SERVICE,
      FAC_SYSTEM_SERVICE,
      FAC_SENSOR_SERVICE,
      FAC_READING_SERVICE,
      FAC_MAINTENANCE_SERVICE,
      FAC_POLICY_SERVICE,
      FAC_PROFILE_SERVICE,
      FAC_COMFORT_ASSESSMENT_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
