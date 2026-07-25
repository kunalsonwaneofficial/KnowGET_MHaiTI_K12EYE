import type { Weekday } from "./weekday";
import type { TimeOfDay } from "./time";

/**
 * The kind of schedulable institutional resource. Open-ended via `other` so an institution
 * can model resources the platform does not name explicitly, without a code change.
 */
export const RESOURCE_KINDS = [
  "classroom",
  "laboratory",
  "library",
  "sports_ground",
  "auditorium",
  "conference_room",
  "equipment",
  "other",
] as const;

export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/** Lifecycle state of a resource. A retired resource can no longer be allocated. */
export const RESOURCE_STATUSES = ["available", "maintenance", "retired"] as const;

export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];

/** Narrow an arbitrary string to a {@link ResourceKind}. */
export const isResourceKind = (value: string): value is ResourceKind =>
  (RESOURCE_KINDS as readonly string[]).includes(value);

/**
 * A recurring weekly window during which a resource is available for scheduling. A resource
 * with no windows is treated as always available (the platform does not over-constrain).
 */
export interface AvailabilityWindow {
  readonly day: Weekday;
  readonly startsAt: TimeOfDay;
  readonly endsAt: TimeOfDay;
}
