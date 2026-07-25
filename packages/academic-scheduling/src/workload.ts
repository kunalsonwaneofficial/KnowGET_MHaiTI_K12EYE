import type { Uuid } from "@knowget/types";
import type { ConflictSlot } from "./conflict";
import { minutesOfDay } from "./time";
import { WEEKDAYS, type Weekday } from "./weekday";

/** A teacher's computed teaching load across a set of schedule slots. */
export interface TeacherWorkload {
  readonly teacherId: Uuid;
  readonly totalPeriods: number;
  readonly totalMinutes: number;
  readonly periodsByDay: Readonly<Record<Weekday, number>>;
  readonly busiestDay: Weekday | null;
  readonly busiestDayPeriods: number;
}

const emptyByDay = (): Record<Weekday, number> =>
  Object.fromEntries(WEEKDAYS.map((day) => [day, 0])) as Record<Weekday, number>;

/**
 * Compute a single teacher's workload over the supplied slots: total periods and minutes,
 * a per-weekday period count, and the busiest day. Slots for other teachers are ignored.
 * Pure and side-effect-free — the foundation for workload balancing and the workload
 * distribution surfaced by scheduling intelligence.
 */
export function computeTeacherWorkload(
  slots: readonly ConflictSlot[],
  teacherId: Uuid,
): TeacherWorkload {
  const own = slots.filter((slot) => slot.teacherId === teacherId);
  const periodsByDay = emptyByDay();
  let totalMinutes = 0;
  for (const slot of own) {
    periodsByDay[slot.dayOfWeek] += 1;
    totalMinutes += minutesOfDay(slot.endsAt) - minutesOfDay(slot.startsAt);
  }
  let busiestDay: Weekday | null = null;
  let busiestDayPeriods = 0;
  for (const day of WEEKDAYS) {
    if (periodsByDay[day] > busiestDayPeriods) {
      busiestDay = day;
      busiestDayPeriods = periodsByDay[day];
    }
  }
  return {
    teacherId,
    totalPeriods: own.length,
    totalMinutes,
    periodsByDay,
    busiestDay,
    busiestDayPeriods,
  };
}

/**
 * Compute the workload of every distinct teacher appearing in the slots, ordered by
 * descending total periods (ties broken by teacher id for determinism).
 */
export function computeWorkloadDistribution(slots: readonly ConflictSlot[]): TeacherWorkload[] {
  const teacherIds = [...new Set(slots.map((slot) => slot.teacherId))];
  return teacherIds
    .map((teacherId) => computeTeacherWorkload(slots, teacherId))
    .sort((a, b) => b.totalPeriods - a.totalPeriods || a.teacherId.localeCompare(b.teacherId));
}
