import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { AllocationAlreadyReleasedError } from "./errors";
import { intervalOf, type TimeOfDay, toTimeOfDay } from "./time";
import type { Weekday } from "./weekday";

/**
 * What is being allocated. `teacher` allocations reference a teacher (Person); the others
 * reference a schedulable {@link Resource}.
 */
export type AllocationKind = "teacher" | "classroom" | "laboratory" | "equipment";

/** Lifecycle state of an allocation. */
export type AllocationStatus = "allocated" | "released";

/**
 * The assignment of a resource (a teacher, classroom, laboratory or piece of equipment) to a
 * recurring weekly window, optionally backing a specific schedule slot and/or section.
 * Carries its own time window so resource-conflict detection is self-contained; the
 * `Allocation` shape is a superset of the engine's `ConflictAllocation` view. An allocation
 * is `allocated` until explicitly released.
 */
export interface Allocation {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly resourceKind: AllocationKind;
  readonly resourceId: Uuid;
  readonly scheduleSlotId: Uuid | null;
  readonly sectionId: Uuid | null;
  readonly dayOfWeek: Weekday;
  readonly startsAt: TimeOfDay;
  readonly endsAt: TimeOfDay;
  readonly occupancy: number | null;
  readonly status: AllocationStatus;
  readonly releasedAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateAllocationParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly resourceKind: AllocationKind;
  readonly resourceId: Uuid;
  readonly dayOfWeek: Weekday;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly scheduleSlotId?: Uuid | null;
  readonly sectionId?: Uuid | null;
  readonly occupancy?: number | null;
}

/** Create an allocation, validating the time-of-day format and that the end is after the start. */
export function createAllocation(params: CreateAllocationParams): Allocation {
  const startsAt = toTimeOfDay(params.startsAt);
  const endsAt = toTimeOfDay(params.endsAt);
  intervalOf(startsAt, endsAt);
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    resourceKind: params.resourceKind,
    resourceId: params.resourceId,
    scheduleSlotId: params.scheduleSlotId ?? null,
    sectionId: params.sectionId ?? null,
    dayOfWeek: params.dayOfWeek,
    startsAt,
    endsAt,
    occupancy: params.occupancy ?? null,
    status: "allocated",
    releasedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Release an allocation, freeing the resource. Idempotency is rejected — releasing twice errors. */
export function releaseAllocation(allocation: Allocation): Allocation {
  if (allocation.status === "released") {
    throw new AllocationAlreadyReleasedError(allocation.id);
  }
  return {
    ...allocation,
    status: "released",
    releasedAt: nowIso(),
    updatedAt: nowIso(),
  };
}
