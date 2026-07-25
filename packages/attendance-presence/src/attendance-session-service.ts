import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { attendanceSessionCreated } from "./attendance-presence-events";
import {
  type AttendanceSession,
  cancelSession,
  closeSession,
  createAttendanceSession,
  openSession,
} from "./attendance-session";
import {
  AttendanceSessionNotFoundError,
  DuplicateAttendanceSessionError,
  OrganizationNotFoundForAttendanceError,
  ScheduleSlotNotFoundForAttendanceError,
  SectionNotFoundForAttendanceError,
  SubjectNotFoundForAttendanceError,
} from "./errors";
import type {
  AttendanceSessionRepository,
  OrganizationDirectory,
  ScheduleSlotDirectory,
  SectionDirectory,
  SubjectDirectory,
} from "./ports";
import type { SessionType } from "./session-type";

export interface AttendanceSessionServiceDeps {
  readonly repository: AttendanceSessionRepository;
  readonly organizations: OrganizationDirectory;
  readonly scheduleSlots?: ScheduleSlotDirectory;
  readonly sections?: SectionDirectory;
  readonly subjects?: SubjectDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export interface CreateAttendanceSessionInput {
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

/**
 * Application service for attendance sessions. Creates a session against a validated
 * Organization (and, when supplied, a validated schedule slot / section / subject), enforces
 * one academic session per (schedule slot, date), and manages the
 * scheduled → open → closed | cancelled lifecycle. Publishes {@link attendanceSessionCreated}.
 */
export class AttendanceSessionService {
  private readonly repository: AttendanceSessionRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly scheduleSlots: ScheduleSlotDirectory | undefined;
  private readonly sections: SectionDirectory | undefined;
  private readonly subjects: SubjectDirectory | undefined;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AttendanceSessionServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.scheduleSlots = deps.scheduleSlots;
    this.sections = deps.sections;
    this.subjects = deps.subjects;
    this.events = deps.events;
  }

  async create(input: CreateAttendanceSessionInput): Promise<AttendanceSession> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForAttendanceError(input.organizationId);
    }
    if (input.scheduleSlotId) {
      if (
        this.scheduleSlots &&
        !(await this.scheduleSlots.exists(input.tenantId, input.scheduleSlotId))
      ) {
        throw new ScheduleSlotNotFoundForAttendanceError(input.scheduleSlotId);
      }
      if (
        await this.repository.findBySlotAndDate(input.tenantId, input.scheduleSlotId, input.date)
      ) {
        throw new DuplicateAttendanceSessionError(input.scheduleSlotId, input.date);
      }
    }
    if (
      input.sectionId &&
      this.sections &&
      !(await this.sections.exists(input.tenantId, input.sectionId))
    ) {
      throw new SectionNotFoundForAttendanceError(input.sectionId);
    }
    if (
      input.subjectId &&
      this.subjects &&
      !(await this.subjects.exists(input.tenantId, input.subjectId))
    ) {
      throw new SubjectNotFoundForAttendanceError(input.subjectId);
    }
    const session = createAttendanceSession(input);
    await this.repository.save(session);
    await this.emit(attendanceSessionCreated(session));
    return session;
  }

  async open(tenantId: TenantId, id: Uuid): Promise<AttendanceSession> {
    return this.mutate(tenantId, id, (s) => openSession(s));
  }

  async close(tenantId: TenantId, id: Uuid): Promise<AttendanceSession> {
    return this.mutate(tenantId, id, (s) => closeSession(s));
  }

  async cancel(tenantId: TenantId, id: Uuid): Promise<AttendanceSession> {
    return this.mutate(tenantId, id, (s) => cancelSession(s));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<AttendanceSession> {
    return this.require(tenantId, id);
  }

  async listForOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<AttendanceSession[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (session: AttendanceSession) => AttendanceSession,
  ): Promise<AttendanceSession> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<AttendanceSession> {
    const session = await this.repository.findById(tenantId, id);
    if (!session) {
      throw new AttendanceSessionNotFoundError(id);
    }
    return session;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
