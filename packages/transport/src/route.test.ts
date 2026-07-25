import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  EmptyRouteError,
  InvalidRouteScheduleError,
  InvalidRouteTransitionError,
  RouteNotEditableError,
} from "./errors";
import {
  activateRoute,
  addRouteStop,
  draftRoute,
  removeRouteStop,
  resumeRoute,
  retireRoute,
  routeSchedule,
  suspendRoute,
} from "./route";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;

const draft = () =>
  draftRoute({
    tenantId: TENANT,
    organizationId: ORG,
    code: "R-01",
    name: "North Loop",
    direction: "both",
    departureMinutes: 7 * 60,
    stops: [
      { key: "depot", name: "Depot", offsetMinutes: 0 },
      { key: "gate", name: "Main Gate", offsetMinutes: 15 },
    ],
  });

describe("route", () => {
  it("drafts with ordered stops and computes a schedule", () => {
    const r = draft();
    expect(r.status).toBe("draft");
    expect(r.stops).toHaveLength(2);
    const schedule = routeSchedule(r);
    expect(schedule.finalArrivalMinutes).toBe(7 * 60 + 15);
  });

  it("rejects a stop whose offset does not advance the route", () => {
    const r = draft();
    expect(() => addRouteStop(r, { key: "x", name: "X", offsetMinutes: 15 })).toThrow(
      InvalidRouteScheduleError,
    );
    const ok = addRouteStop(r, { key: "school", name: "School", offsetMinutes: 30 });
    expect(ok.stops).toHaveLength(3);
  });

  it("freezes stops once active and runs the lifecycle", () => {
    const active = activateRoute(draft());
    expect(active.status).toBe("active");
    expect(() => addRouteStop(active, { key: "z", name: "Z", offsetMinutes: 40 })).toThrow(
      RouteNotEditableError,
    );
    expect(() => removeRouteStop(active, "gate")).toThrow(RouteNotEditableError);
    const suspended = suspendRoute(active);
    expect(resumeRoute(suspended).status).toBe("active");
    const retired = retireRoute(suspended);
    expect(retired.status).toBe("retired");
    expect(() => suspendRoute(retired)).toThrow(InvalidRouteTransitionError);
  });

  it("cannot activate a route with no stops", () => {
    const empty = draftRoute({
      tenantId: TENANT,
      organizationId: ORG,
      code: "R-02",
      name: "Empty",
      direction: "pickup",
      departureMinutes: 8 * 60,
    });
    expect(() => activateRoute(empty)).toThrow(EmptyRouteError);
  });
});
