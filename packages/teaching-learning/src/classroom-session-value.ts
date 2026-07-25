/**
 * Lifecycle of a classroom session — the delivery of a scheduled instructional session. A
 * `scheduled` session is planned; delivering it (recording actual topics/activities) moves it
 * to `delivered`; closing it out with reflections moves it to `completed`; a session that did
 * not run is `cancelled`. Terminal states are `completed` and `cancelled`.
 */
export const CLASSROOM_SESSION_STATUSES = [
  "scheduled",
  "delivered",
  "completed",
  "cancelled",
] as const;

export type ClassroomSessionStatus = (typeof CLASSROOM_SESSION_STATUSES)[number];

/** Narrow an arbitrary string to a {@link ClassroomSessionStatus}. */
export const isClassroomSessionStatus = (value: string): value is ClassroomSessionStatus =>
  (CLASSROOM_SESSION_STATUSES as readonly string[]).includes(value);

/**
 * A lightweight, non-authoritative summary of student participation in a delivered session —
 * how many of the expected learners were engaged. Attendance recording is a Presence-platform
 * (P2-D08) concern and an explicit P2-D09 non-goal; this is the teacher's engagement note used
 * only for descriptive instructional intelligence.
 */
export interface ParticipationSummary {
  readonly expected: number;
  readonly engaged: number;
}
