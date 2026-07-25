import { createEvent } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import type { AttendancePolicyRuleType } from "./attendance-policy-rule";
import type { AttendanceRecord } from "./attendance-record";
import type { AttendanceSession } from "./attendance-session";
import type { Leave } from "./leave";
import type { Participation } from "./participation";

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

// --- Leave -----------------------------------------------------------------------
export const LEAVE_REQUESTED = "attendance.leave.requested";
export const LEAVE_APPROVED = "attendance.leave.approved";
export const LEAVE_REJECTED = "attendance.leave.rejected";

export interface LeaveEventPayload {
  readonly leaveId: Uuid;
  readonly organizationId: Uuid;
  readonly personId: Uuid;
  readonly leaveType: string;
  readonly fromDate: string;
  readonly toDate: string;
}

export type LeaveRequestedEvent = DomainEvent<typeof LEAVE_REQUESTED, LeaveEventPayload>;
export type LeaveApprovedEvent = DomainEvent<typeof LEAVE_APPROVED, LeaveEventPayload>;
export type LeaveRejectedEvent = DomainEvent<typeof LEAVE_REJECTED, LeaveEventPayload>;

const leavePayload = (leave: Leave): LeaveEventPayload => ({
  leaveId: leave.id,
  organizationId: leave.organizationId,
  personId: leave.personId,
  leaveType: leave.leaveType,
  fromDate: leave.fromDate,
  toDate: leave.toDate,
});

export const leaveRequested = (leave: Leave): LeaveRequestedEvent =>
  createEvent(LEAVE_REQUESTED, leavePayload(leave), { tenantId: leave.tenantId });

export const leaveApproved = (leave: Leave): LeaveApprovedEvent =>
  createEvent(LEAVE_APPROVED, leavePayload(leave), { tenantId: leave.tenantId });

export const leaveRejected = (leave: Leave): LeaveRejectedEvent =>
  createEvent(LEAVE_REJECTED, leavePayload(leave), { tenantId: leave.tenantId });

// --- Participation ---------------------------------------------------------------
export const PARTICIPATION_RECORDED = "attendance.participation.recorded";

export interface ParticipationEventPayload {
  readonly participationId: Uuid;
  readonly organizationId: Uuid;
  readonly participantId: Uuid;
  readonly activityType: string;
  readonly date: string;
}

export type ParticipationRecordedEvent = DomainEvent<
  typeof PARTICIPATION_RECORDED,
  ParticipationEventPayload
>;

export const participationRecorded = (participation: Participation): ParticipationRecordedEvent =>
  createEvent(
    PARTICIPATION_RECORDED,
    {
      participationId: participation.id,
      organizationId: participation.organizationId,
      participantId: participation.participantId,
      activityType: participation.activityType,
      date: participation.date,
    },
    { tenantId: participation.tenantId },
  );

// --- Policy evaluation -----------------------------------------------------------
// These carry computed results (not aggregate state), so their factories take the tenant
// and an explicit payload rather than an aggregate.
export const ATTENDANCE_POLICY_EVALUATED = "attendance.policy.evaluated";
export const ATTENDANCE_THRESHOLD_REACHED = "attendance.threshold.reached";

export interface AttendancePolicyEvaluatedPayload {
  readonly organizationId: Uuid;
  readonly participantId: Uuid;
  readonly attendancePercentage: number;
  readonly policiesEvaluated: number;
  readonly compliant: boolean;
}

export interface AttendanceThresholdReachedPayload {
  readonly organizationId: Uuid;
  readonly participantId: Uuid;
  readonly policyId: Uuid;
  readonly ruleType: AttendancePolicyRuleType;
  readonly attendancePercentage: number;
  readonly threshold: number;
}

export type AttendancePolicyEvaluatedEvent = DomainEvent<
  typeof ATTENDANCE_POLICY_EVALUATED,
  AttendancePolicyEvaluatedPayload
>;
export type AttendanceThresholdReachedEvent = DomainEvent<
  typeof ATTENDANCE_THRESHOLD_REACHED,
  AttendanceThresholdReachedPayload
>;

export const attendancePolicyEvaluated = (
  tenantId: TenantId,
  payload: AttendancePolicyEvaluatedPayload,
): AttendancePolicyEvaluatedEvent =>
  createEvent(ATTENDANCE_POLICY_EVALUATED, payload, { tenantId });

export const attendanceThresholdReached = (
  tenantId: TenantId,
  payload: AttendanceThresholdReachedPayload,
): AttendanceThresholdReachedEvent =>
  createEvent(ATTENDANCE_THRESHOLD_REACHED, payload, { tenantId });
