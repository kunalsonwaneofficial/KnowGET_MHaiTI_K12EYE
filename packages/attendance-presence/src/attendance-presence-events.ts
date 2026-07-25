import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { AttendanceRecord } from "./attendance-record";
import type { AttendanceSession } from "./attendance-session";

// --- Attendance session ----------------------------------------------------------
export const ATTENDANCE_SESSION_CREATED = "attendance.session.created";

export interface AttendanceSessionEventPayload {
  readonly attendanceSessionId: Uuid;
  readonly organizationId: Uuid;
  readonly sessionType: string;
  readonly date: string;
}

export type AttendanceSessionCreatedEvent = DomainEvent<
  typeof ATTENDANCE_SESSION_CREATED,
  AttendanceSessionEventPayload
>;

export const attendanceSessionCreated = (
  session: AttendanceSession,
): AttendanceSessionCreatedEvent =>
  createEvent(
    ATTENDANCE_SESSION_CREATED,
    {
      attendanceSessionId: session.id,
      organizationId: session.organizationId,
      sessionType: session.sessionType,
      date: session.date,
    },
    { tenantId: session.tenantId },
  );

// --- Attendance record -----------------------------------------------------------
export const ATTENDANCE_RECORDED = "attendance.recorded";
export const ATTENDANCE_CORRECTED = "attendance.corrected";

export interface AttendanceRecordEventPayload {
  readonly attendanceRecordId: Uuid;
  readonly sessionId: Uuid;
  readonly organizationId: Uuid;
  readonly participantId: Uuid;
  readonly status: string;
  readonly version: number;
}

export type AttendanceRecordedEvent = DomainEvent<
  typeof ATTENDANCE_RECORDED,
  AttendanceRecordEventPayload
>;
export type AttendanceCorrectedEvent = DomainEvent<
  typeof ATTENDANCE_CORRECTED,
  AttendanceRecordEventPayload
>;

const recordPayload = (record: AttendanceRecord): AttendanceRecordEventPayload => ({
  attendanceRecordId: record.id,
  sessionId: record.sessionId,
  organizationId: record.organizationId,
  participantId: record.participantId,
  status: record.status,
  version: record.version,
});

export const attendanceRecorded = (record: AttendanceRecord): AttendanceRecordedEvent =>
  createEvent(ATTENDANCE_RECORDED, recordPayload(record), { tenantId: record.tenantId });

export const attendanceCorrected = (record: AttendanceRecord): AttendanceCorrectedEvent =>
  createEvent(ATTENDANCE_CORRECTED, recordPayload(record), { tenantId: record.tenantId });
