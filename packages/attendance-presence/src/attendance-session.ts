import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { AttendanceSessionStateError, EmptyAttendanceSessionFieldError } from "./errors";
import type { SessionStatus, SessionType } from "./session-type";

/**
 * A scheduled attendance event — an academic period (bound to a P2-D07 schedule slot), an
 * examination, an event, an activity, a meeting or a club session. Attendance is recorded
 * against a session while it is `scheduled` or `open`; closing finalises it. The session's
 * date flows onto its records, so attendance calculations are date-aware.
 */
export interface AttendanceSession {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly sessionType: SessionType;
  readonly title: string;
  readonly date: string;
  readonly scheduleSlotId: Uuid | null;
  readonly sectionId: Uuid | null;
  readonly subjectId: Uuid | null;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly status: SessionStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateAttendanceSessionParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly sessionType: SessionType;
  readonly title: string;
  readonly date: string;
  readonly scheduleSlotId?: Uuid | null;
  readonly sectionId?: Uuid | null;
  readonly subjectId?: Uuid | null;
  readonly startsAt?: string | null;
  readonly endsAt?: string | null;
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyAttendanceSessionFieldError(field);
  }
  return trimmed;
};

const touch = (
  session: AttendanceSession,
  patch: Partial<AttendanceSession>,
): AttendanceSession => ({
  ...session,
  ...patch,
  updatedAt: nowIso(),
});

/** Create a new scheduled attendance session. */
export function createAttendanceSession(params: CreateAttendanceSessionParams): AttendanceSession {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    sessionType: params.sessionType,
    title: requireText(params.title, "title"),
    date: requireText(params.date, "date"),
    scheduleSlotId: params.scheduleSlotId ?? null,
    sectionId: params.sectionId ?? null,
    subjectId: params.subjectId ?? null,
    startsAt: params.startsAt?.trim() || null,
    endsAt: params.endsAt?.trim() || null,
    status: "scheduled",
    createdAt: now,
    updatedAt: now,
  };
}

/** Open the session for recording (scheduled → open). */
export function openSession(session: AttendanceSession): AttendanceSession {
  if (session.status !== "scheduled") {
    throw new AttendanceSessionStateError(session.id, "scheduled", session.status);
  }
  return touch(session, { status: "open" });
}

/** Close the session, finalising its records (open → closed). */
export function closeSession(session: AttendanceSession): AttendanceSession {
  if (session.status !== "open") {
    throw new AttendanceSessionStateError(session.id, "open", session.status);
  }
  return touch(session, { status: "closed" });
}

/** Cancel the session (scheduled or open → cancelled). Terminal. */
export function cancelSession(session: AttendanceSession): AttendanceSession {
  if (session.status === "closed" || session.status === "cancelled") {
    throw new AttendanceSessionStateError(session.id, "scheduled or open", session.status);
  }
  return touch(session, { status: "cancelled" });
}

/** Whether attendance may be recorded against the session (scheduled or open). */
export const acceptsRecording = (session: AttendanceSession): boolean =>
  session.status === "scheduled" || session.status === "open";
