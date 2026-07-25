import {
  DuplicateStopKeyError,
  EmptyStopKeyError,
  EmptyStopNameError,
  InvalidStopOffsetError,
} from "./errors";

/**
 * A single stop on a {@link Route} — a named boarding/alighting point at a whole-minute offset from the
 * route's departure. The `key` is a stable identifier unique within the route (subscriptions reference a
 * pickup/drop stop by key). The stop's order on the route is its position in the route's stop list; its
 * `offsetMinutes` must strictly increase along that list (enforced by the schedule engine).
 */
export interface RouteStop {
  readonly key: string;
  readonly name: string;
  readonly offsetMinutes: number;
  readonly landmark: string | null;
}

export interface RouteStopInput {
  readonly key: string;
  readonly name: string;
  readonly offsetMinutes: number;
  readonly landmark?: string | null;
}

/** Normalize and validate a route-stop input (non-empty key and name; non-negative integer offset). */
export function makeRouteStop(input: RouteStopInput): RouteStop {
  const key = input.key.trim();
  if (key.length === 0) {
    throw new EmptyStopKeyError();
  }
  const name = input.name.trim();
  if (name.length === 0) {
    throw new EmptyStopNameError();
  }
  if (!Number.isInteger(input.offsetMinutes) || input.offsetMinutes < 0) {
    throw new InvalidStopOffsetError(input.offsetMinutes);
  }
  return {
    key,
    name,
    offsetMinutes: input.offsetMinutes,
    landmark: input.landmark?.trim() || null,
  };
}

/** Build an ordered route-stop list from inputs, rejecting duplicate keys (order preserved). */
export function buildRouteStops(inputs: readonly RouteStopInput[]): RouteStop[] {
  const seen = new Set<string>();
  const stops: RouteStop[] = [];
  for (const input of inputs) {
    const stop = makeRouteStop(input);
    if (seen.has(stop.key)) {
      throw new DuplicateStopKeyError(stop.key);
    }
    seen.add(stop.key);
    stops.push(stop);
  }
  return stops;
}
