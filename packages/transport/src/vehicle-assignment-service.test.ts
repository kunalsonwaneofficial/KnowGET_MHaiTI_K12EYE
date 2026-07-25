import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { beforeEach, describe, expect, it } from "vitest";
import { registerDriver } from "./driver";
import {
  DriverLicenseExpiredError,
  RouteHasActiveAssignmentError,
  RouteNotActiveError,
  VehicleNotActiveError,
} from "./errors";
import {
  InMemoryDriverRepository,
  InMemoryRouteRepository,
  InMemoryVehicleAssignmentRepository,
  InMemoryVehicleRepository,
} from "./ports";
import { activateRoute, draftRoute } from "./route";
import { VehicleAssignmentService } from "./vehicle-assignment-service";
import { registerVehicle, retireVehicle } from "./vehicle";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const EMP = "33333333-3333-3333-3333-333333333333" as Uuid;

let routes: InMemoryRouteRepository;
let vehicles: InMemoryVehicleRepository;
let drivers: InMemoryDriverRepository;
let svc: VehicleAssignmentService;
let events: DomainEvent[];
let routeId: Uuid;
let vehicleId: Uuid;
let driverId: Uuid;

beforeEach(async () => {
  routes = new InMemoryRouteRepository();
  vehicles = new InMemoryVehicleRepository();
  drivers = new InMemoryDriverRepository();
  events = [];
  const route = activateRoute(
    draftRoute({
      tenantId: TENANT,
      organizationId: ORG,
      code: "R-01",
      name: "North Loop",
      direction: "both",
      departureMinutes: 420,
      stops: [{ key: "depot", name: "Depot", offsetMinutes: 0 }],
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
  vehicleId = vehicle.id;
  const driver = registerDriver({
    tenantId: TENANT,
    organizationId: ORG,
    employeeId: EMP,
    licenseNumber: "DL-0099",
    licenseExpiry: "2027-03-31",
  });
  await drivers.save(driver);
  driverId = driver.id;
  svc = new VehicleAssignmentService({
    repository: new InMemoryVehicleAssignmentRepository(),
    routes,
    vehicles,
    drivers,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
});

const create = (effectiveFrom = "2026-08-01") =>
  svc.create({ tenantId: TENANT, routeId, vehicleId, driverId, effectiveFrom });

describe("VehicleAssignmentService", () => {
  it("assigns an active vehicle+driver to an active route, deriving org and emitting", async () => {
    const a = await create();
    expect(a.organizationId).toBe(ORG);
    expect(a.status).toBe("active");
    expect(events.map((e) => e.type)).toEqual(["transport.assignment.created"]);
  });

  it("enforces one active assignment per route, and allows a new one after ending", async () => {
    const a = await create();
    await expect(create()).rejects.toBeInstanceOf(RouteHasActiveAssignmentError);
    await svc.end(TENANT, a.id, "2026-09-01");
    const b = await create("2026-09-02");
    expect(b.status).toBe("active");
  });

  it("rejects an expired licence and an inactive vehicle", async () => {
    await expect(create("2028-01-01")).rejects.toBeInstanceOf(DriverLicenseExpiredError);
    const vehicle = await vehicles.findById(TENANT, vehicleId);
    await vehicles.save(retireVehicle(vehicle!));
    await expect(create()).rejects.toBeInstanceOf(VehicleNotActiveError);
  });

  it("rejects an inactive (suspended) route", async () => {
    const route = await routes.findById(TENANT, routeId);
    // suspend the route directly in the repo
    await routes.save({ ...route!, status: "suspended" });
    await expect(create()).rejects.toBeInstanceOf(RouteNotActiveError);
  });
});
