import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { intervalOf, type TimeOfDay, toTimeOfDay } from "./time";
import type { Weekday } from "./weekday";

/**
 * A scheduled instructional period within a timetable: on a given weekday, from `startsAt`
 * to `endsAt`, a subject is taught by a teacher to a section, optionally in a venue (a
 * schedulable resource). The slot's organization is derived from its timetable. Slots are
 * the atoms the conflict engine reasons over; the `ScheduleSlot` shape is a superset of the
 * engine's `ConflictSlot` view, so no mapping is needed.
 */
export interface ScheduleSlot {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly timetableId: Uuid;
  readonly dayOfWeek: Weekday;
  readonly startsAt: TimeOfDay;
  readonly endsAt: TimeOfDay;
  readonly subjectId: Uuid;
  readonly teacherId: Uuid;
  readonly classId: Uuid | null;
  readonly sectionId: Uuid;
  readonly venueId: Uuid | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateScheduleSlotParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly timetableId: Uuid;
  readonly dayOfWeek: Weekday;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly subjectId: Uuid;
  readonly teacherId: Uuid;
  readonly sectionId: Uuid;
  readonly classId?: Uuid | null;
  readonly venueId?: Uuid | null;
}

const touch = (slot: ScheduleSlot, patch: Partial<ScheduleSlot>): ScheduleSlot => ({
  ...slot,
  ...patch,
  updatedAt: nowIso(),
});

/** Create a schedule slot, validating the time-of-day format and that the end is after the start. */
export function createScheduleSlot(params: CreateScheduleSlotParams): ScheduleSlot {
  const startsAt = toTimeOfDay(params.startsAt);
  const endsAt = toTimeOfDay(params.endsAt);
  intervalOf(startsAt, endsAt); // throws InvalidTimeRangeError when end <= start
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    timetableId: params.timetableId,
    dayOfWeek: params.dayOfWeek,
    startsAt,
    endsAt,
    subjectId: params.subjectId,
    teacherId: params.teacherId,
    classId: params.classId ?? null,
    sectionId: params.sectionId,
    venueId: params.venueId ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Reassign the teacher of a slot. */
export function assignTeacher(slot: ScheduleSlot, teacherId: Uuid): ScheduleSlot {
  return touch(slot, { teacherId });
}

/** Assign (or clear) the venue of a slot. */
export function assignVenue(slot: ScheduleSlot, venueId: Uuid | null): ScheduleSlot {
  return touch(slot, { venueId });
}

/** Move a slot to a new day and/or time, revalidating the time range. */
export function rescheduleSlot(
  slot: ScheduleSlot,
  dayOfWeek: Weekday,
  startsAt: string,
  endsAt: string,
): ScheduleSlot {
  const start = toTimeOfDay(startsAt);
  const end = toTimeOfDay(endsAt);
  intervalOf(start, end);
  return touch(slot, { dayOfWeek, startsAt: start, endsAt: end });
}
