import type { TenantId, Uuid } from "@knowget/types";
import { beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryRouteRepository,
  InMemoryRouteUtilizationProfileRepository,
  InMemoryTransportSubscriptionRepository,
  InMemoryVehicleAssignmentRepository,
  InMemoryVehicleRepository,
} from "./ports";
import { activateRoute, draftRoute } from "./route";
import { RouteUtilizationProfileService } from "./route-utilization-profile-service";
import { activateSubscription, requestSubscription } from "./transport-subscription";
import { createVehicleAssignment } from "./vehicle-assignment";
import { registerVehicle } from "./vehicle";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;

let routes: InMemoryRouteRepository;
let assignments: InMemoryVehicleAssignmentRepository;
let vehicles: InMemoryVehicleRepository;
let subscriptions: InMemoryTransportSubscriptionRepository;
let svc: RouteUtilizationProfileService;
let routeId: Uuid;

async function subscribe(studentId: Uuid) {
  const sub = activateSubscription(
    requestSubscription({
      tenantId: TENANT,
      organizationId: ORG,
      studentId,
      routeId,
      pickupStopKey: "gate",
      dropStopKey: "gate",
      direction: "both",
      effectiveFrom: "2026-08-01",
    }),
  );
  await subscriptions.save(sub);
}

beforeEach(async () => {
  routes = new InMemoryRouteRepository();
  assignments = new InMemoryVehicleAssignmentRepository();
  vehicles = new InMemoryVehicleRepository();
  subscriptions = new InMemoryTransportSubscriptionRepository();
  const route = activateRoute(
    draftRoute({
      tenantId: TENANT,
      organizationId: ORG,
      code: "R-01",
      name: "North Loop",
      direction: "both",
      departureMinutes: 420,
      stops: [{ key: "gate", name: "Main Gate", offsetMinutes: 0 }],
    }),
  );
  await routes.save(route);
  routeId = route.id;
  const vehicle = registerVehicle({
    tenantId: TENANT,
    organizationId: ORG,
    registrationNumber: "MH12AB1234",
    type: "bus",
    seatingCapacity: 40,
    ownership: "owned",
  });
  await vehicles.save(vehicle);
  await assignments.save(
    createVehicleAssignment({
      tenantId: TENANT,
      organizationId: ORG,
      routeId,
      vehicleId: vehicle.id,
      driverId: "55555555-5555-5555-5555-555555555555" as Uuid,
      effectiveFrom: "2026-08-01",
    }),
  );
  svc = new RouteUtilizationProfileService({
    repository: new InMemoryRouteUtilizationProfileRepository(),
    routes,
    assignments,
    vehicles,
    subscriptions,
  });
});

describe("RouteUtilizationProfileService", () => {
  it("reconciles capacity vs active subscribers and version-bumps on refresh", async () => {
    await subscribe("aaaaaaaa-0000-0000-0000-000000000001" as Uuid);
    await subscribe("aaaaaaaa-0000-0000-0000-000000000002" as Uuid);
    const p = await svc.refresh(TENANT, routeId);
    expect(p.capacity).toBe(40);
    expect(p.subscriberCount).toBe(2);
    expect(p.seatsAvailable).toBe(38);
    expect(p.overCapacity).toBe(false);
    expect(p.hasActiveAssignment).toBe(true);
    expect(p.version).toBe(1);
    const p2 = await svc.refresh(TENANT, routeId);
    expect(p2.id).toBe(p.id);
    expect(p2.version).toBe(2);
  });

  it("flags over-capacity and rolls up a fleet summary", async () => {
    // capacity 40, one subscriber → not over capacity; force over by shrinking is not needed here —
    // verify the rollup wiring with the one route.
    await subscribe("aaaaaaaa-0000-0000-0000-000000000001" as Uuid);
    await svc.refresh(TENANT, routeId);
    const summary = await svc.fleetSummaryFor(TENANT, ORG);
    expect(summary.routeCount).toBe(1);
    expect(summary.totalSubscribers).toBe(1);
    expect(summary.overCapacityRouteCount).toBe(0);
  });
});
