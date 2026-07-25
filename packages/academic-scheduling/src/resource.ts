import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyResourceFieldError,
  InvalidResourceCapacityError,
  ResourceRetiredError,
} from "./errors";
import { type AvailabilityWindow, type ResourceKind, type ResourceStatus } from "./resource-kind";

/**
 * A schedulable institutional resource — a classroom, laboratory, library, sports ground,
 * auditorium, conference room, piece of equipment or anything else an institution books.
 * One per (organization, code). Carries an optional capacity, an optional location and a set
 * of recurring weekly availability windows, across an available → maintenance → retired
 * lifecycle. A retired resource can no longer be allocated.
 */
export interface Resource {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly kind: ResourceKind;
  readonly capacity: number | null;
  readonly location: string | null;
  readonly availabilityWindows: readonly AvailabilityWindow[];
  readonly status: ResourceStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateResourceParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly kind: ResourceKind;
  readonly capacity?: number | null;
  readonly location?: string | null;
  readonly availabilityWindows?: readonly AvailabilityWindow[];
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyResourceFieldError(field);
  }
  return trimmed;
};

const requireCapacity = (capacity: number | null | undefined): number | null => {
  if (capacity === null || capacity === undefined) {
    return null;
  }
  if (!Number.isInteger(capacity) || capacity < 0) {
    throw new InvalidResourceCapacityError(capacity);
  }
  return capacity;
};

const touch = (resource: Resource, patch: Partial<Resource>): Resource => ({
  ...resource,
  ...patch,
  updatedAt: nowIso(),
});

const assertNotRetired = (resource: Resource): void => {
  if (resource.status === "retired") {
    throw new ResourceRetiredError(resource.id);
  }
};

/** Create a new available resource. */
export function createResource(params: CreateResourceParams): Resource {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    code: requireText(params.code, "code"),
    name: requireText(params.name, "name"),
    kind: params.kind,
    capacity: requireCapacity(params.capacity),
    location: params.location?.trim() || null,
    availabilityWindows: params.availabilityWindows ? [...params.availabilityWindows] : [],
    status: "available",
    createdAt: now,
    updatedAt: now,
  };
}

/** Rename the resource. Not permitted once retired. */
export function renameResource(resource: Resource, name: string): Resource {
  assertNotRetired(resource);
  return touch(resource, { name: requireText(name, "name") });
}

/** Set (or clear) the resource capacity. Not permitted once retired. */
export function setResourceCapacity(resource: Resource, capacity: number | null): Resource {
  assertNotRetired(resource);
  return touch(resource, { capacity: requireCapacity(capacity) });
}

/** Set (or clear) the resource location. Not permitted once retired. */
export function setResourceLocation(resource: Resource, location: string | null): Resource {
  assertNotRetired(resource);
  return touch(resource, { location: location?.trim() || null });
}

/** Replace the resource's availability windows. Not permitted once retired. */
export function setAvailabilityWindows(
  resource: Resource,
  windows: readonly AvailabilityWindow[],
): Resource {
  assertNotRetired(resource);
  return touch(resource, { availabilityWindows: [...windows] });
}

/** Take the resource out of service temporarily (available → maintenance). */
export function markResourceMaintenance(resource: Resource): Resource {
  assertNotRetired(resource);
  return touch(resource, { status: "maintenance" });
}

/** Return the resource to service (maintenance → available). */
export function markResourceAvailable(resource: Resource): Resource {
  assertNotRetired(resource);
  return touch(resource, { status: "available" });
}

/** Retire the resource permanently. Terminal. */
export function retireResource(resource: Resource): Resource {
  return touch(resource, { status: "retired" });
}
