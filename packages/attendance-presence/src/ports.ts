import type { TenantId, Uuid } from "@knowget/types";
import type { AttendancePolicy } from "./attendance-policy";
import type { AttendanceRecord } from "./attendance-record";
import type { AttendanceSession } from "./attendance-session";
import type { Leave } from "./leave";
import type { Participation } from "./participation";
import type { PresenceProfile } from "./presence-profile";

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

// --- Leave repository ------------------------------------------------------------

/** Storage contract for leave. `listByPerson` feeds the attendance summary (approved leave). */
export interface LeaveRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Leave | null>;
  listByPerson(tenantId: TenantId, personId: Uuid): Promise<Leave[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Leave[]>;
  listByTenant(tenantId: TenantId): Promise<Leave[]>;
  save(leave: Leave): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link LeaveRepository} — the default for tests and bootstrap. */
export class InMemoryLeaveRepository implements LeaveRepository {
  private readonly byId = new Map<string, Leave>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Leave | null> {
    const leave = this.byId.get(id);
    return leave && leave.tenantId === tenantId ? leave : null;
  }

  async listByPerson(tenantId: TenantId, personId: Uuid): Promise<Leave[]> {
    return [...this.byId.values()].filter(
      (l) => l.tenantId === tenantId && l.personId === personId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Leave[]> {
    return [...this.byId.values()].filter(
      (l) => l.tenantId === tenantId && l.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Leave[]> {
    return [...this.byId.values()].filter((l) => l.tenantId === tenantId);
  }

  async save(leave: Leave): Promise<void> {
    this.byId.set(leave.id, leave);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const leave = this.byId.get(id);
    if (leave && leave.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

// --- Attendance policy repository -------------------------------------------------

/**
 * Storage contract for attendance policies. `listActiveForEvaluation` returns only `active`
 * policies for an organization, so an `AttendancePolicyRepository` can feed the policy
 * engine directly.
 */
export interface AttendancePolicyRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<AttendancePolicy | null>;
  findByCode(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<AttendancePolicy | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AttendancePolicy[]>;
  listByTenant(tenantId: TenantId): Promise<AttendancePolicy[]>;
  listActiveForEvaluation(tenantId: TenantId, organizationId: Uuid): Promise<AttendancePolicy[]>;
  save(policy: AttendancePolicy): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link AttendancePolicyRepository} — the default for tests and bootstrap. */
export class InMemoryAttendancePolicyRepository implements AttendancePolicyRepository {
  private readonly byId = new Map<string, AttendancePolicy>();

  async findById(tenantId: TenantId, id: Uuid): Promise<AttendancePolicy | null> {
    const policy = this.byId.get(id);
    return policy && policy.tenantId === tenantId ? policy : null;
  }

  async findByCode(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<AttendancePolicy | null> {
    return (
      [...this.byId.values()].find(
        (p) => p.tenantId === tenantId && p.organizationId === organizationId && p.code === code,
      ) ?? null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AttendancePolicy[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<AttendancePolicy[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async listActiveForEvaluation(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<AttendancePolicy[]> {
    return [...this.byId.values()].filter(
      (p) =>
        p.tenantId === tenantId && p.organizationId === organizationId && p.status === "active",
    );
  }

  async save(policy: AttendancePolicy): Promise<void> {
    this.byId.set(policy.id, policy);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const policy = this.byId.get(id);
    if (policy && policy.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

// --- Presence profile repository -------------------------------------------------

/** Storage contract for presence profiles (one per participant). */
export interface PresenceProfileRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<PresenceProfile | null>;
  findByParticipant(tenantId: TenantId, participantId: Uuid): Promise<PresenceProfile | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<PresenceProfile[]>;
  listByTenant(tenantId: TenantId): Promise<PresenceProfile[]>;
  save(profile: PresenceProfile): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link PresenceProfileRepository} — the default for tests and bootstrap. */
export class InMemoryPresenceProfileRepository implements PresenceProfileRepository {
  private readonly byId = new Map<string, PresenceProfile>();

  async findById(tenantId: TenantId, id: Uuid): Promise<PresenceProfile | null> {
    const profile = this.byId.get(id);
    return profile && profile.tenantId === tenantId ? profile : null;
  }

  async findByParticipant(
    tenantId: TenantId,
    participantId: Uuid,
  ): Promise<PresenceProfile | null> {
    return (
      [...this.byId.values()].find(
        (p) => p.tenantId === tenantId && p.participantId === participantId,
      ) ?? null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<PresenceProfile[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<PresenceProfile[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(profile: PresenceProfile): Promise<void> {
    this.byId.set(profile.id, profile);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const profile = this.byId.get(id);
    if (profile && profile.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

// --- Participation repository ----------------------------------------------------

/** Storage contract for participation. `listByParticipant` feeds the presence profile. */
export interface ParticipationRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Participation | null>;
  listByParticipant(tenantId: TenantId, participantId: Uuid): Promise<Participation[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Participation[]>;
  listByTenant(tenantId: TenantId): Promise<Participation[]>;
  save(participation: Participation): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link ParticipationRepository} — the default for tests and bootstrap. */
export class InMemoryParticipationRepository implements ParticipationRepository {
  private readonly byId = new Map<string, Participation>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Participation | null> {
    const participation = this.byId.get(id);
    return participation && participation.tenantId === tenantId ? participation : null;
  }

  async listByParticipant(tenantId: TenantId, participantId: Uuid): Promise<Participation[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.participantId === participantId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Participation[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Participation[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(participation: Participation): Promise<void> {
    this.byId.set(participation.id, participation);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const participation = this.byId.get(id);
    if (participation && participation.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
