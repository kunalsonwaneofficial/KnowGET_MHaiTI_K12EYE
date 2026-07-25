import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { beforeEach, describe, expect, it } from "vitest";
import { registerDriver } from "./driver";
import { DriverLicenseExpiredError, VehicleNotActiveError } from "./errors";
import {
  InMemoryDriverRepository,
  InMemoryRouteRepository,
  InMemoryTripRepository,
  InMemoryVehicleRepository,
} from "./ports";
import { activateRoute, draftRoute } from "./route";
import { TripService } from "./trip-service";
import { registerVehicle, retireVehicle } from "./vehicle";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const EMP = "33333333-3333-3333-3333-333333333333" as Uuid;
const STU = "aaaaaaaa-0000-0000-0000-000000000001" as Uuid;

let vehicles: InMemoryVehicleRepository;
let svc: TripService;
let events: DomainEvent[];
let routeId: Uuid;
let vehicleId: Uuid;
let driverId: Uuid;

beforeEach(async () => {
  const routes = new InMemoryRouteRepository();
  vehicles = new InMemoryVehicleRepository();
  const drivers = new InMemoryDriverRepository();
  events = [];
  const route = activateRoute(
    draftRoute({
      tenantId: TENANT,
      organizationId: ORG,
      code: "R-01",
      name: "North Loop",
      direction: "pickup",
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
    seatingCapacity: 2,
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
  svc = new TripService({
    repository: new InMemoryTripRepository(),
    routes,
    vehicles,
    drivers,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
});

const schedule = (serviceDate = "2026-08-10") =>
  svc.schedule({
    tenantId: TENANT,
    routeId,
    vehicleId,
    driverId,
    serviceDate,
    direction: "pickup",
  });

describe("TripService", () => {
  it("schedules a trip snapshotting capacity, and runs it end to end", async () => {
    const t = await schedule();
    expect(t.capacity).toBe(2);
    expect(t.organizationId).toBe(ORG);
    await svc.start(TENANT, t.id);
    await svc.recordBoarding(TENANT, t.id, {
      studentId: STU,
      stopKey: "gate",
      type: "boarded",
      occurredAt: "2026-08-10T07:05:00Z",
    });
    const occ = await svc.occupancyFor(TENANT, t.id);
    expect(occ.finalOnboard).toBe(1);
    await svc.complete(TENANT, t.id);
    expect(events.map((e) => e.type)).toEqual([
      "transport.trip.scheduled",
      "transport.trip.started",
      "transport.trip.completed",
    ]);
  });

  it("rejects scheduling with an expired licence or an inactive vehicle", async () => {
    await expect(schedule("2028-01-01")).rejects.toBeInstanceOf(DriverLicenseExpiredError);
    const vehicle = await vehicles.findById(TENANT, vehicleId);
    await vehicles.save(retireVehicle(vehicle!));
    await expect(schedule()).rejects.toBeInstanceOf(VehicleNotActiveError);
  });
});
