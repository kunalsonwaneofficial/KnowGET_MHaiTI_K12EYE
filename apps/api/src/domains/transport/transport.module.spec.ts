import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { DriverController } from "./driver.controller";
import { RouteController } from "./route.controller";
import { RouteUtilizationProfileController } from "./route-utilization-profile.controller";
import { TransportModule } from "./transport.module";
import {
  TR_ASSIGNMENT_SERVICE,
  TR_DOCUMENT_SERVICE,
  TR_DRIVER_SERVICE,
  TR_ROUTE_SERVICE,
  TR_SUBSCRIPTION_SERVICE,
  TR_TRIP_SERVICE,
  TR_UTILIZATION_SERVICE,
  TR_VEHICLE_SERVICE,
} from "./transport.tokens";
import { TransportSubscriptionController } from "./transport-subscription.controller";
import { TripController } from "./trip.controller";
import { VehicleAssignmentController } from "./vehicle-assignment.controller";
import { VehicleController } from "./vehicle.controller";
import { VehicleDocumentController } from "./vehicle-document.controller";

/**
 * Stands in for the global platform providers (database handle, event bus) the domain modules inject,
 * so the transport DI graph — including the imported Organization, Workforce and Student Lifecycle
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

describe("TransportModule (integration)", () => {
  it("compiles the full transport DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, TransportModule],
    }).compile();

    expect(moduleRef.get(VehicleController)).toBeInstanceOf(VehicleController);
    expect(moduleRef.get(DriverController)).toBeInstanceOf(DriverController);
    expect(moduleRef.get(VehicleDocumentController)).toBeInstanceOf(VehicleDocumentController);
    expect(moduleRef.get(RouteController)).toBeInstanceOf(RouteController);
    expect(moduleRef.get(VehicleAssignmentController)).toBeInstanceOf(VehicleAssignmentController);
    expect(moduleRef.get(TransportSubscriptionController)).toBeInstanceOf(
      TransportSubscriptionController,
    );
    expect(moduleRef.get(TripController)).toBeInstanceOf(TripController);
    expect(moduleRef.get(RouteUtilizationProfileController)).toBeInstanceOf(
      RouteUtilizationProfileController,
    );

    await moduleRef.close();
  });

  it("exposes each aggregate's application service for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, TransportModule],
    }).compile();

    for (const token of [
      TR_VEHICLE_SERVICE,
      TR_DRIVER_SERVICE,
      TR_ROUTE_SERVICE,
      TR_ASSIGNMENT_SERVICE,
      TR_SUBSCRIPTION_SERVICE,
      TR_TRIP_SERVICE,
      TR_DOCUMENT_SERVICE,
      TR_UTILIZATION_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
