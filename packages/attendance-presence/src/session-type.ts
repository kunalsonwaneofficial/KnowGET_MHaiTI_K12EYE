/**
 * The kind of attendance event a session represents. Academic periods bind to a schedule
 * slot (P2-D07); the others (examinations, events, activities, meetings, club sessions)
 * stand alone, so attendance is not limited to the academic timetable.
 */
export const SESSION_TYPES = [
  "academic_period",
  "examination",
  "event",
  "activity",
  "meeting",
  "club_session",
] as const;

export type SessionType = (typeof SESSION_TYPES)[number];

/** Lifecycle of an attendance session: scheduled → open (recording) → closed | cancelled. */
export const SESSION_STATUSES = ["scheduled", "open", "closed", "cancelled"] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];

/** Narrow an arbitrary string to a {@link SessionType}. */
export const isSessionType = (value: string): value is SessionType =>
  (SESSION_TYPES as readonly string[]).includes(value);
