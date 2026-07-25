import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateStopKeyError,
  EmptyRouteCodeError,
  EmptyRouteError,
  EmptyRouteNameError,
  InvalidRouteScheduleError,
  InvalidRouteTransitionError,
  RouteNotEditableError,
  RouteStopNotFoundError,
} from "./errors";
import { computeRouteSchedule } from "./route-schedule";
import { buildRouteStops, makeRouteStop, type RouteStop, type RouteStopInput } from "./route-stop";
import type { RouteDirection, RouteStatus } from "./transport-value";
import type { RouteSchedule, RouteStopScheduleView } from "./transport-view";

const MINUTES_PER_DAY = 24 * 60;

/**
 * A transport route — an ordered set of stops a vehicle serves from a scheduled departure, in one
 * direction (morning `pickup`, afternoon `drop`, or `both`). It runs `draft` (stops editable) → `active`
 * (published, stops frozen) → `suspended` → `retired`. The `code` is unique within the tenant; the pure
 * schedule engine validates the stop offsets strictly increase, so an active route always has a coherent
 * schedule. Assignments and subscriptions attach to an active route.
 */
export interface Route {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly direction: RouteDirection;
  readonly departureMinutes: number;
  readonly stops: readonly RouteStop[];
  readonly status: RouteStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface DraftRouteParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly direction: RouteDirection;
  readonly departureMinutes: number;
  readonly stops?: readonly RouteStopInput[];
}

/** The stops as the schedule engine's view — sequence is the 1-based position in the ordered list. */
const asScheduleViews = (stops: readonly RouteStop[]): RouteStopScheduleView[] =>
  stops.map((stop, index) => ({ sequence: index + 1, offsetMinutes: stop.offsetMinutes }));

/** Validate an ordered stop list forms a coherent schedule (offsets strictly increase). */
function validateStopOrder(departureMinutes: number, stops: readonly RouteStop[]): void {
  if (stops.length > 0) {
    computeRouteSchedule(departureMinutes, asScheduleViews(stops));
  }
}

const requireDeparture = (departureMinutes: number): number => {
  if (
    !Number.isInteger(departureMinutes) ||
    departureMinutes < 0 ||
    departureMinutes >= MINUTES_PER_DAY
  ) {
    throw new InvalidRouteScheduleError(
      "the departure time must be minutes since midnight in [0, 1440)",
    );
  }
  return departureMinutes;
};

/** Draft a route (status `draft`). Code, name and a valid departure time required. */
export function draftRoute(params: DraftRouteParams): Route {
  const code = params.code.trim();
  if (code.length === 0) {
    throw new EmptyRouteCodeError();
  }
  const name = params.name.trim();
  if (name.length === 0) {
    throw new EmptyRouteNameError();
  }
  const departureMinutes = requireDeparture(params.departureMinutes);
  const stops = buildRouteStops(params.stops ?? []);
  validateStopOrder(departureMinutes, stops);
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    code,
    name,
    direction: params.direction,
    departureMinutes,
    stops,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (route: Route, patch: Partial<Route>): Route => ({
  ...route,
  ...patch,
  updatedAt: nowIso(),
});

const requireDraft = (route: Route): void => {
  if (route.status !== "draft") {
    throw new RouteNotEditableError(route.id, route.status);
  }
};

/** Rename a route. */
export function renameRoute(route: Route, name: string): Route {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new EmptyRouteNameError();
  }
  return touch(route, { name: trimmed });
}

/** Set the route's departure time (draft only; re-validates the stop schedule). */
export function setRouteDeparture(route: Route, departureMinutes: number): Route {
  requireDraft(route);
  const departure = requireDeparture(departureMinutes);
  validateStopOrder(departure, route.stops);
  return touch(route, { departureMinutes: departure });
}

/** Add a stop to a draft route (unique key; offsets must keep strictly increasing). */
export function addRouteStop(route: Route, input: RouteStopInput): Route {
  requireDraft(route);
  const stop = makeRouteStop(input);
  if (route.stops.some((s) => s.key === stop.key)) {
    throw new DuplicateStopKeyError(stop.key);
  }
  const stops = [...route.stops, stop];
  validateStopOrder(route.departureMinutes, stops);
  return touch(route, { stops });
}

/** Remove a stop from a draft route. */
export function removeRouteStop(route: Route, key: string): Route {
  requireDraft(route);
  if (!route.stops.some((s) => s.key === key)) {
    throw new RouteStopNotFoundError(key);
  }
  return touch(route, { stops: route.stops.filter((s) => s.key !== key) });
}

/** Activate (publish) a draft route (→ `active`), freezing its stops. Requires at least one stop. */
export function activateRoute(route: Route): Route {
  if (route.status !== "draft") {
    throw new InvalidRouteTransitionError(route.status, "active");
  }
  if (route.stops.length === 0) {
    throw new EmptyRouteError();
  }
  validateStopOrder(route.departureMinutes, route.stops);
  return touch(route, { status: "active" });
}

/** Suspend an active route (→ `suspended`). */
export function suspendRoute(route: Route): Route {
  if (route.status !== "active") {
    throw new InvalidRouteTransitionError(route.status, "suspended");
  }
  return touch(route, { status: "suspended" });
}

/** Resume a suspended route (→ `active`). */
export function resumeRoute(route: Route): Route {
  if (route.status !== "suspended") {
    throw new InvalidRouteTransitionError(route.status, "active");
  }
  return touch(route, { status: "active" });
}

/** Retire a route (→ `retired`, terminal). */
export function retireRoute(route: Route): Route {
  if (route.status === "retired") {
    throw new InvalidRouteTransitionError(route.status, "retired");
  }
  return touch(route, { status: "retired" });
}

/** Whether the route is active (can take assignments and subscriptions). */
export const isRouteActive = (route: Route): boolean => route.status === "active";

/** Whether the route has a stop with the given key. */
export const routeHasStop = (route: Route, key: string): boolean =>
  route.stops.some((s) => s.key === key);

/** The route's computed schedule (per-stop arrivals, duration) via the pure engine. */
export const routeSchedule = (route: Route): RouteSchedule =>
  computeRouteSchedule(route.departureMinutes, asScheduleViews(route.stops));
