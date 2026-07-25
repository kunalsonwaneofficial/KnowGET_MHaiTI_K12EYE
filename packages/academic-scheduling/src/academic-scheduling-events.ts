import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { ConflictKind } from "./conflict";
import type { ScheduleSlot } from "./schedule-slot";
import type { Timetable } from "./timetable";

// --- Timetable -------------------------------------------------------------------
export const TIMETABLE_CREATED = "scheduling.timetable.created";
export const TIMETABLE_PUBLISHED = "scheduling.timetable.published";
export const TIMETABLE_REVISED = "scheduling.timetable.revised";

export interface TimetableEventPayload {
  readonly timetableId: Uuid;
  readonly organizationId: Uuid;
  readonly academicYear: string;
  readonly version: number;
}

export type TimetableCreatedEvent = DomainEvent<typeof TIMETABLE_CREATED, TimetableEventPayload>;
export type TimetablePublishedEvent = DomainEvent<
  typeof TIMETABLE_PUBLISHED,
  TimetableEventPayload
>;
export type TimetableRevisedEvent = DomainEvent<typeof TIMETABLE_REVISED, TimetableEventPayload>;

const timetablePayload = (timetable: Timetable): TimetableEventPayload => ({
  timetableId: timetable.id,
  organizationId: timetable.organizationId,
  academicYear: timetable.academicYear,
  version: timetable.version,
});

export const timetableCreated = (timetable: Timetable): TimetableCreatedEvent =>
  createEvent(TIMETABLE_CREATED, timetablePayload(timetable), { tenantId: timetable.tenantId });

export const timetablePublished = (timetable: Timetable): TimetablePublishedEvent =>
  createEvent(TIMETABLE_PUBLISHED, timetablePayload(timetable), { tenantId: timetable.tenantId });

export const timetableRevised = (timetable: Timetable): TimetableRevisedEvent =>
  createEvent(TIMETABLE_REVISED, timetablePayload(timetable), { tenantId: timetable.tenantId });

// --- Schedule slot ---------------------------------------------------------------
export const SCHEDULE_SLOT_ASSIGNED = "scheduling.slot.assigned";

export interface ScheduleSlotEventPayload {
  readonly scheduleSlotId: Uuid;
  readonly timetableId: Uuid;
  readonly organizationId: Uuid;
  readonly dayOfWeek: string;
  readonly startsAt: string;
}

export type ScheduleSlotAssignedEvent = DomainEvent<
  typeof SCHEDULE_SLOT_ASSIGNED,
  ScheduleSlotEventPayload
>;

export const scheduleSlotAssigned = (slot: ScheduleSlot): ScheduleSlotAssignedEvent =>
  createEvent(
    SCHEDULE_SLOT_ASSIGNED,
    {
      scheduleSlotId: slot.id,
      timetableId: slot.timetableId,
      organizationId: slot.organizationId,
      dayOfWeek: slot.dayOfWeek,
      startsAt: slot.startsAt,
    },
    { tenantId: slot.tenantId },
  );

// --- Conflict --------------------------------------------------------------------
export const CONFLICT_DETECTED = "scheduling.conflict.detected";

export interface ConflictDetectedPayload {
  readonly timetableId: Uuid;
  readonly organizationId: Uuid;
  readonly conflictCount: number;
  readonly kinds: readonly ConflictKind[];
}

export type ConflictDetectedEvent = DomainEvent<typeof CONFLICT_DETECTED, ConflictDetectedPayload>;

export const conflictDetected = (
  timetable: Timetable,
  kinds: readonly ConflictKind[],
  conflictCount: number,
): ConflictDetectedEvent =>
  createEvent(
    CONFLICT_DETECTED,
    {
      timetableId: timetable.id,
      organizationId: timetable.organizationId,
      conflictCount,
      kinds,
    },
    { tenantId: timetable.tenantId },
  );
