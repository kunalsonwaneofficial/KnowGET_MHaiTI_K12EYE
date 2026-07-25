import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { DriverService } from "./driver-service";
import type { EmployeeDirectory, OrganizationDirectory, StudentDirectory } from "./ports";
import {
  InMemoryDriverRepository,
  InMemoryRouteRepository,
  InMemoryRouteUtilizationProfileRepository,
  InMemoryTransportSubscriptionRepository,
  InMemoryTripRepository,
  InMemoryVehicleAssignmentRepository,
  InMemoryVehicleDocumentRepository,
  InMemoryVehicleRepository,
} from "./ports";
import { RouteService } from "./route-service";
import { RouteUtilizationProfileService } from "./route-utilization-profile-service";
import { TransportSubscriptionService } from "./transport-subscription-service";
import { TripService } from "./trip-service";
import { VehicleAssignmentService } from "./vehicle-assignment-service";
import { VehicleDocumentService } from "./vehicle-document-service";
import { VehicleService } from "./vehicle-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const EMP = "44444444-4444-4444-4444-444444444444" as Uuid;
const STU = "55555555-5555-5555-5555-555555555555" as Uuid;

const organizations: OrganizationDirectory = { exists: async (_t, id) => id === ORG };
const employees: EmployeeDirectory = {
  exists: async (_t, id) => id === EMP,
  organizationOf: async (_t, id) => (id === EMP ? ORG : null),
};
const students: StudentDirectory = {
  exists: async (_t, id) => id === STU,
  organizationOf: async (_t, id) => (id === STU ? ORG : null),
};

describe("transport spine (end to end)", () => {
  it("runs vehicle → driver → route → assignment → subscription → trip → document → utilization", async () => {
    const vehicleRepo = new InMemoryVehicleRepository();
    const driverRepo = new InMemoryDriverRepository();
    const routeRepo = new InMemoryRouteRepository();
    const assignmentRepo = new InMemoryVehicleAssignmentRepository();
    const subscriptionRepo = new InMemoryTransportSubscriptionRepository();

    const vehicles = new VehicleService({ repository: vehicleRepo, organizations });
    const drivers = new DriverService({ repository: driverRepo, employees });
    const routes = new RouteService({ repository: routeRepo, organizations });
    const assignments = new VehicleAssignmentService({
      repository: assignmentRepo,
      routes: routeRepo,
      vehicles: vehicleRepo,
      drivers: driverRepo,
    });
    const subscriptions = new TransportSubscriptionService({
      repository: subscriptionRepo,
      students,
      routes: routeRepo,
    });
    const trips = new TripService({
      repository: new InMemoryTripRepository(),
      routes: routeRepo,
      vehicles: vehicleRepo,
      drivers: driverRepo,
    });
    const documents = new VehicleDocumentService({
      repository: new InMemoryVehicleDocumentRepository(),
      vehicles: vehicleRepo,
    });
    const utilization = new RouteUtilizationProfileService({
      repository: new InMemoryRouteUtilizationProfileRepository(),
      routes: routeRepo,
      assignments: assignmentRepo,
      vehicles: vehicleRepo,
      subscriptions: subscriptionRepo,
    });

    // 1. A vehicle (40 seats) and a licensed driver.
    const vehicle = await vehicles.create({
      tenantId: TENANT,
      organizationId: ORG,
      registrationNumber: "MH12AB1234",
      type: "bus",
      seatingCapacity: 40,
      ownership: "owned",
    });
    const driver = await drivers.register({
      tenantId: TENANT,
      employeeId: EMP,
      licenseNumber: "DL-0099",
      licenseExpiry: "2027-03-31",
    });

    // 2. An active route with two stops.
    const draft = await routes.draft({
      tenantId: TENANT,
      organizationId: ORG,
      code: "R-01",
      name: "North Loop",
      direction: "both",
      departureMinutes: 7 * 60,
      stops: [
        { key: "gate", name: "Main Gate", offsetMinutes: 0 },
        { key: "school", name: "School", offsetMinutes: 20 },
      ],
    });
    const route = await routes.activate(TENANT, draft.id);
    expect(route.status).toBe("active");

    // 3. Assign the vehicle+driver to the route.
    const assignment = await assignments.create({
      tenantId: TENANT,
      routeId: route.id,
      vehicleId: vehicle.id,
      driverId: driver.id,
      effectiveFrom: "2026-08-01",
    });
    expect(assignment.organizationId).toBe(ORG);

    // 4. A student subscribes and is activated.
    const sub = await subscriptions.request({
      tenantId: TENANT,
      studentId: STU,
      routeId: route.id,
      pickupStopKey: "gate",
      dropStopKey: "school",
      direction: "both",
      effectiveFrom: "2026-08-01",
    });
    await subscriptions.activate(TENANT, sub.id);
    expect(await subscriptions.countActiveForRoute(TENANT, route.id)).toBe(1);

    // 5. A trip runs: schedule → start → board → occupancy → complete.
    const trip = await trips.schedule({
      tenantId: TENANT,
      routeId: route.id,
      vehicleId: vehicle.id,
      driverId: driver.id,
      serviceDate: "2026-08-10",
      direction: "pickup",
    });
    expect(trip.capacity).toBe(40);
    await trips.start(TENANT, trip.id);
    await trips.recordBoarding(TENANT, trip.id, {
      studentId: STU,
      stopKey: "gate",
      type: "boarded",
      occurredAt: "2026-08-10T07:05:00Z",
    });
    const occupancy = await trips.occupancyFor(TENANT, trip.id);
    expect(occupancy.finalOnboard).toBe(1);
    await trips.complete(TENANT, trip.id);

    // 6. A vehicle document, checked for compliance.
    await documents.record({
      tenantId: TENANT,
      vehicleId: vehicle.id,
      type: "insurance",
      documentNumber: "INS-1",
      issuedOn: "2026-01-01",
      expiresOn: "2027-01-01",
    });
    const compliance = await documents.complianceForVehicle(TENANT, vehicle.id, "2026-08-10");
    expect(compliance[0]?.status).toBe("valid");

    // 7. The route utilization profile and the fleet rollup.
    const profile = await utilization.refresh(TENANT, route.id);
    expect(profile.capacity).toBe(40);
    expect(profile.subscriberCount).toBe(1);
    expect(profile.seatsAvailable).toBe(39);
    expect(profile.hasActiveAssignment).toBe(true);

    const summary = await utilization.fleetSummaryFor(TENANT, ORG);
    expect(summary.routeCount).toBe(1);
    expect(summary.totalSubscribers).toBe(1);
    expect(summary.overCapacityRouteCount).toBe(0);
  });
});
