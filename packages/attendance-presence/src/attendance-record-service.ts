import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { attendanceCorrected, attendanceRecorded } from "./attendance-presence-events";
import { acceptsRecording, type AttendanceSession } from "./attendance-session";
import {
  amendRemarks,
  type AttendanceRecord,
  correctAttendanceRecord,
  createAttendanceRecord,
  type ParticipantType,
} from "./attendance-record";
import type { AttendanceMethod, AttendanceStatus } from "./attendance-status";
import {
  AttendanceRecordNotFoundError,
  AttendanceSessionNotFoundError,
  AttendanceSessionStateError,
  DuplicateAttendanceRecordError,
  ParticipantNotFoundForAttendanceError,
} from "./errors";
import type {
  AttendanceRecordRepository,
  AttendanceSessionRepository,
  ParticipantDirectory,
} from "./ports";

export interface AttendanceRecordServiceDeps {
  readonly repository: AttendanceRecordRepository;
  readonly sessions: AttendanceSessionRepository;
  readonly participants: ParticipantDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export interface RecordAttendanceInput {
  readonly tenantId: TenantId;
  readonly sessionId: Uuid;
  readonly participantId: Uuid;
  readonly participantType: ParticipantType;
  readonly status: AttendanceStatus;
  readonly method: AttendanceMethod;
  readonly recordedBy?: Uuid | null;
  readonly remarks?: string | null;
}

export interface BulkRecordEntry {
  readonly participantId: Uuid;
  readonly participantType: ParticipantType;
  readonly status: AttendanceStatus;
  readonly remarks?: string | null;
}

export interface BulkRecordAttendanceInput {
  readonly tenantId: TenantId;
  readonly sessionId: Uuid;
  readonly method: AttendanceMethod;
  readonly recordedBy?: Uuid | null;
  readonly entries: readonly BulkRecordEntry[];
}

/**
 * Application service for attendance records. Records a participant's attendance into a
 * session that is accepting records (scheduled or open), one record per participant per
 * session, deriving the organization and date from the session and validating the
 * participant. Supports bulk recording (any collection method — the platform is
 * provider-agnostic). Corrections are always permitted and always audited (they append to
 * the record's correction log and bump its version), regardless of session status, so no
 * attendance change is untraceable. Publishes {@link attendanceRecorded} on recording and
 * {@link attendanceCorrected} on correction.
 */
export class AttendanceRecordService {
  private readonly repository: AttendanceRecordRepository;
  private readonly sessions: AttendanceSessionRepository;
  private readonly participants: ParticipantDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AttendanceRecordServiceDeps) {
    this.repository = deps.repository;
    this.sessions = deps.sessions;
    this.participants = deps.participants;
    this.events = deps.events;
  }

  async record(input: RecordAttendanceInput): Promise<AttendanceRecord> {
    const session = await this.requireRecordableSession(input.tenantId, input.sessionId);
    const record = await this.recordInto(session, input);
    return record;
  }

  async bulkRecord(input: BulkRecordAttendanceInput): Promise<AttendanceRecord[]> {
    const session = await this.requireRecordableSession(input.tenantId, input.sessionId);
    const results: AttendanceRecord[] = [];
    for (const entry of input.entries) {
      results.push(
        await this.recordInto(session, {
          tenantId: input.tenantId,
          sessionId: input.sessionId,
          participantId: entry.participantId,
          participantType: entry.participantType,
          status: entry.status,
          method: input.method,
          ...(input.recordedBy !== undefined ? { recordedBy: input.recordedBy } : {}),
          ...(entry.remarks !== undefined ? { remarks: entry.remarks } : {}),
        }),
      );
    }
    return results;
  }

  async correct(
    tenantId: TenantId,
    id: Uuid,
    toStatus: AttendanceStatus,
    reason: string,
    correctedBy: Uuid | null = null,
  ): Promise<AttendanceRecord> {
    const corrected = correctAttendanceRecord(
      await this.require(tenantId, id),
      toStatus,
      reason,
      correctedBy,
    );
    await this.repository.save(corrected);
    await this.emit(attendanceCorrected(corrected));
    return corrected;
  }

  async amendRemarks(
    tenantId: TenantId,
    id: Uuid,
    remarks: string | null,
  ): Promise<AttendanceRecord> {
    const updated = amendRemarks(await this.require(tenantId, id), remarks);
    await this.repository.save(updated);
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<AttendanceRecord> {
    return this.require(tenantId, id);
  }

  async listForSession(tenantId: TenantId, sessionId: Uuid): Promise<AttendanceRecord[]> {
    return this.repository.listBySession(tenantId, sessionId);
  }

  async listForParticipant(tenantId: TenantId, participantId: Uuid): Promise<AttendanceRecord[]> {
    return this.repository.listByParticipant(tenantId, participantId);
  }

  private async recordInto(
    session: AttendanceSession,
    input: RecordAttendanceInput,
  ): Promise<AttendanceRecord> {
    if (!(await this.participants.exists(input.tenantId, input.participantId))) {
      throw new ParticipantNotFoundForAttendanceError(input.participantId);
    }
    if (
      await this.repository.findBySessionAndParticipant(
        input.tenantId,
        input.sessionId,
        input.participantId,
      )
    ) {
      throw new DuplicateAttendanceRecordError(input.sessionId, input.participantId);
    }
    const record = createAttendanceRecord({
      tenantId: input.tenantId,
      organizationId: session.organizationId,
      sessionId: session.id,
      participantId: input.participantId,
      participantType: input.participantType,
      status: input.status,
      method: input.method,
      date: session.date,
      ...(input.recordedBy !== undefined ? { recordedBy: input.recordedBy } : {}),
      ...(input.remarks !== undefined ? { remarks: input.remarks } : {}),
    });
    await this.repository.save(record);
    await this.emit(attendanceRecorded(record));
    return record;
  }

  private async requireRecordableSession(
    tenantId: TenantId,
    sessionId: Uuid,
  ): Promise<AttendanceSession> {
    const session = await this.sessions.findById(tenantId, sessionId);
    if (!session) {
      throw new AttendanceSessionNotFoundError(sessionId);
    }
    if (!acceptsRecording(session)) {
      throw new AttendanceSessionStateError(session.id, "scheduled or open", session.status);
    }
    return session;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<AttendanceRecord> {
    const record = await this.repository.findById(tenantId, id);
    if (!record) {
      throw new AttendanceRecordNotFoundError(id);
    }
    return record;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
