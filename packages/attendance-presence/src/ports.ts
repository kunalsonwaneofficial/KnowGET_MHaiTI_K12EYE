import type { TenantId, Uuid } from "@knowget/types";
import type { AttendanceRecord } from "./attendance-record";
import type { AttendanceSession } from "./attendance-session";

// --- Cross-domain directory ports ------------------------------------------------
// Existence checks over other bounded contexts, so the pure package never imports them.

/** Does this organization exist in the tenant? (P2-D01-M01) */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/** Does this participant (a Person: student/teacher/staff) exist in the tenant? (P2-D01-M02) */
export interface ParticipantDirectory {
  exists(tenantId: TenantId, participantId: Uuid): Promise<boolean>;
}

/** Does this schedule slot exist in the tenant? (P2-D07) */
export interface ScheduleSlotDirectory {
  exists(tenantId: TenantId, scheduleSlotId: Uuid): Promise<boolean>;
}

/** Does this section exist in the tenant? (P2-D06) */
export interface SectionDirectory {
  exists(tenantId: TenantId, sectionId: Uuid): Promise<boolean>;
}

/** Does this subject exist in the tenant? (P2-D06) */
export interface SubjectDirectory {
  exists(tenantId: TenantId, subjectId: Uuid): Promise<boolean>;
}

// --- Attendance session repository -----------------------------------------------

/** Storage contract for attendance sessions. */
export interface AttendanceSessionRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<AttendanceSession | null>;
  /** An academic session for a given schedule slot on a date — for duplicate detection. */
  findBySlotAndDate(
    tenantId: TenantId,
    scheduleSlotId: Uuid,
    date: string,
  ): Promise<AttendanceSession | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AttendanceSession[]>;
  listByTenant(tenantId: TenantId): Promise<AttendanceSession[]>;
  save(session: AttendanceSession): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link AttendanceSessionRepository} — the default for tests and bootstrap. */
export class InMemoryAttendanceSessionRepository implements AttendanceSessionRepository {
  private readonly byId = new Map<string, AttendanceSession>();

  async findById(tenantId: TenantId, id: Uuid): Promise<AttendanceSession | null> {
    const session = this.byId.get(id);
    return session && session.tenantId === tenantId ? session : null;
  }

  async findBySlotAndDate(
    tenantId: TenantId,
    scheduleSlotId: Uuid,
    date: string,
  ): Promise<AttendanceSession | null> {
    return (
      [...this.byId.values()].find(
        (s) => s.tenantId === tenantId && s.scheduleSlotId === scheduleSlotId && s.date === date,
      ) ?? null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AttendanceSession[]> {
    return [...this.byId.values()].filter(
      (s) => s.tenantId === tenantId && s.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<AttendanceSession[]> {
    return [...this.byId.values()].filter((s) => s.tenantId === tenantId);
  }

  async save(session: AttendanceSession): Promise<void> {
    this.byId.set(session.id, session);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const session = this.byId.get(id);
    if (session && session.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

// --- Attendance record repository -------------------------------------------------

/** Storage contract for attendance records. */
export interface AttendanceRecordRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<AttendanceRecord | null>;
  /** A record for a participant in a session — for one-record-per-participant enforcement. */
  findBySessionAndParticipant(
    tenantId: TenantId,
    sessionId: Uuid,
    participantId: Uuid,
  ): Promise<AttendanceRecord | null>;
  listBySession(tenantId: TenantId, sessionId: Uuid): Promise<AttendanceRecord[]>;
  /** Every record for a participant — the input to attendance summaries and presence profiles. */
  listByParticipant(tenantId: TenantId, participantId: Uuid): Promise<AttendanceRecord[]>;
  listByTenant(tenantId: TenantId): Promise<AttendanceRecord[]>;
  save(record: AttendanceRecord): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link AttendanceRecordRepository} — the default for tests and bootstrap. */
export class InMemoryAttendanceRecordRepository implements AttendanceRecordRepository {
  private readonly byId = new Map<string, AttendanceRecord>();

  async findById(tenantId: TenantId, id: Uuid): Promise<AttendanceRecord | null> {
    const record = this.byId.get(id);
    return record && record.tenantId === tenantId ? record : null;
  }

  async findBySessionAndParticipant(
    tenantId: TenantId,
    sessionId: Uuid,
    participantId: Uuid,
  ): Promise<AttendanceRecord | null> {
    return (
      [...this.byId.values()].find(
        (r) =>
          r.tenantId === tenantId && r.sessionId === sessionId && r.participantId === participantId,
      ) ?? null
    );
  }

  async listBySession(tenantId: TenantId, sessionId: Uuid): Promise<AttendanceRecord[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.sessionId === sessionId,
    );
  }

  async listByParticipant(tenantId: TenantId, participantId: Uuid): Promise<AttendanceRecord[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.participantId === participantId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<AttendanceRecord[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(record: AttendanceRecord): Promise<void> {
    this.byId.set(record.id, record);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const record = this.byId.get(id);
    if (record && record.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
