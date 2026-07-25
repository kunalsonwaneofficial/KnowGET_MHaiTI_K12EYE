import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DuplicateSubscriptionError,
  RouteNotActiveError,
  StopNotOnRouteError,
  StudentNotFoundForTransportError,
} from "./errors";
import { InMemoryRouteRepository, InMemoryTransportSubscriptionRepository } from "./ports";
import type { StudentDirectory } from "./ports";
import { activateRoute, draftRoute, suspendRoute } from "./route";
import { TransportSubscriptionService } from "./transport-subscription-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STU = "33333333-3333-3333-3333-333333333333" as Uuid;

const students: StudentDirectory = {
  exists: async (_t, id) => id === STU,
  organizationOf: async (_t, id) => (id === STU ? ORG : null),
};

let routes: InMemoryRouteRepository;
let svc: TransportSubscriptionService;
let events: DomainEvent[];
let routeId: Uuid;

beforeEach(async () => {
  routes = new InMemoryRouteRepository();
  events = [];
  const route = activateRoute(
    draftRoute({
      tenantId: TENANT,
      organizationId: ORG,
      code: "R-01",
      name: "North Loop",
      direction: "both",
      departureMinutes: 420,
      stops: [
        { key: "gate", name: "Main Gate", offsetMinutes: 0 },
        { key: "school", name: "School", offsetMinutes: 20 },
      ],
    }),
  );
  await routes.save(route);
  routeId = route.id;
  svc = new TransportSubscriptionService({
    repository: new InMemoryTransportSubscriptionRepository(),
    students,
    routes,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
});

const request = (overrides: Record<string, unknown> = {}) =>
  svc.request({
    tenantId: TENANT,
    studentId: STU,
    routeId,
    pickupStopKey: "gate",
    dropStopKey: "school",
    direction: "both",
    effectiveFrom: "2026-08-01",
    ...overrides,
  });

describe("TransportSubscriptionService", () => {
  it("requests a subscription deriving the org, validating stops and uniqueness", async () => {
    const s = await request();
    expect(s.organizationId).toBe(ORG);
    expect(s.status).toBe("requested");
    expect(events.map((e) => e.type)).toEqual(["transport.subscription.requested"]);
    await expect(request()).rejects.toBeInstanceOf(DuplicateSubscriptionError);
    await expect(request({ pickupStopKey: "nowhere" })).rejects.toBeInstanceOf(StopNotOnRouteError);
    await expect(request({ studentId: "x" as Uuid })).rejects.toBeInstanceOf(
      StudentNotFoundForTransportError,
    );
  });

  it("rejects a subscription on a non-active route", async () => {
    const route = await routes.findById(TENANT, routeId);
    await routes.save(suspendRoute(route!));
    await expect(request()).rejects.toBeInstanceOf(RouteNotActiveError);
  });

  it("drives the lifecycle and counts active subscribers", async () => {
    const s = await request();
    await svc.activate(TENANT, s.id);
    expect(await svc.countActiveForRoute(TENANT, routeId)).toBe(1);
    await svc.suspend(TENANT, s.id);
    expect(await svc.countActiveForRoute(TENANT, routeId)).toBe(0);
    await svc.resume(TENANT, s.id);
    await svc.end(TENANT, s.id, "2027-03-31");
    expect(events.map((e) => e.type)).toEqual([
      "transport.subscription.requested",
      "transport.subscription.activated",
      "transport.subscription.suspended",
      "transport.subscription.resumed",
      "transport.subscription.ended",
    ]);
  });
});
