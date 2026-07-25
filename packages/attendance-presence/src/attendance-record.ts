import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { AttendanceMethod, AttendanceStatus } from "./attendance-status";
import { InvalidAttendanceCorrectionError } from "./errors";

/** The kind of participant an attendance record is for. */
export const PARTICIPANT_TYPES = ["student", "teacher", "staff"] as const;

export type ParticipantType = (typeof PARTICIPANT_TYPES)[number];

/**
 * One entry in a record's append-only correction log — the status it changed from and to,
 * why, when and by whom. Every change to a recorded status is captured here, so attendance
 * history is auditable and no change is untraceable.
 */
export interface AttendanceCorrection {
  readonly fromStatus: AttendanceStatus;
  readonly toStatus: AttendanceStatus;
  readonly reason: string;
  readonly correctedAt: ISODateString;
  readonly correctedBy: Uuid | null;
}

/**
 * The attendance state of one participant in one session — the atom the policy engine and
 * presence intelligence reason over (its `status` + `date` structurally satisfy the engines'
 * record view). Provider-agnostic: `method` records how it was captured. Corrections never
 * discard history — they append to the correction log and bump the version — so the record's
 * lineage is always reconstructable.
 */
export interface AttendanceRecord {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly sessionId: Uuid;
  readonly participantId: Uuid;
  readonly participantType: ParticipantType;
  readonly status: AttendanceStatus;
  readonly method: AttendanceMethod;
  readonly date: string;
  readonly recordedAt: ISODateString;
  readonly recordedBy: Uuid | null;
  readonly remarks: string | null;
  readonly corrections: readonly AttendanceCorrection[];
  readonly version: number;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateAttendanceRecordParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly sessionId: Uuid;
  readonly participantId: Uuid;
  readonly participantType: ParticipantType;
  readonly status: AttendanceStatus;
  readonly method: AttendanceMethod;
  readonly date: string;
  readonly recordedBy?: Uuid | null;
  readonly remarks?: string | null;
}

/** Record a participant's attendance for a session (version 1, no corrections yet). */
export function createAttendanceRecord(params: CreateAttendanceRecordParams): AttendanceRecord {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    sessionId: params.sessionId,
    participantId: params.participantId,
    participantType: params.participantType,
    status: params.status,
    method: params.method,
    date: params.date,
    recordedAt: now,
    recordedBy: params.recordedBy ?? null,
    remarks: params.remarks?.trim() || null,
    corrections: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Correct a record's status. The change must be real (a different status) and must record a
 * reason; it appends to the correction log and bumps the version, never overwriting history.
 */
export function correctAttendanceRecord(
  record: AttendanceRecord,
  toStatus: AttendanceStatus,
  reason: string,
  correctedBy: Uuid | null = null,
): AttendanceRecord {
  const trimmedReason = reason.trim();
  if (trimmedReason.length === 0) {
    throw new InvalidAttendanceCorrectionError("a reason is required");
  }
  if (toStatus === record.status) {
    throw new InvalidAttendanceCorrectionError("the status is unchanged");
  }
  const correction: AttendanceCorrection = {
    fromStatus: record.status,
    toStatus,
    reason: trimmedReason,
    correctedAt: nowIso(),
    correctedBy,
  };
  return {
    ...record,
    status: toStatus,
    corrections: [...record.corrections, correction],
    version: record.version + 1,
    updatedAt: nowIso(),
  };
}

/** Amend a record's free-text remarks (not an audited status change). */
export function amendRemarks(record: AttendanceRecord, remarks: string | null): AttendanceRecord {
  return { ...record, remarks: remarks?.trim() || null, updatedAt: nowIso() };
}
