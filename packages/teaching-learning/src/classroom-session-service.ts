import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  amendSessionDelivery,
  cancelSession,
  type ClassroomSession,
  completeSession,
  createClassroomSession,
  deliverSession,
  recordSessionReflections,
  type SessionDelivery,
  setPlannedTopics,
} from "./classroom-session";
import {
  ClassroomSessionNotFoundError,
  LessonPlanNotFoundError,
  OrganizationNotFoundForTeachingError,
  ScheduleSlotNotFoundForTeachingError,
  SectionNotFoundForTeachingError,
  SubjectNotFoundForTeachingError,
} from "./errors";
import { classroomSessionCompleted, lessonDelivered } from "./teaching-learning-events";
import type {
  ClassroomSessionRepository,
  LessonPlanRepository,
  OrganizationDirectory,
  ScheduleSlotDirectory,
  SectionDirectory,
  SubjectDirectory,
} from "./ports";

export interface ClassroomSessionServiceDeps {
  readonly repository: ClassroomSessionRepository;
  readonly organizations: OrganizationDirectory;
  readonly scheduleSlots?: ScheduleSlotDirectory;
  readonly sections?: SectionDirectory;
  readonly subjects?: SubjectDirectory;
  readonly lessonPlans?: LessonPlanRepository;
  readonly events?: Pick<EventBus, "publish">;
}

export interface CreateClassroomSessionInput {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly title: string;
  readonly date: string;
  readonly scheduleSlotId?: Uuid | null;
  readonly lessonPlanId?: Uuid | null;
  readonly sectionId?: Uuid | null;
  readonly subjectId?: Uuid | null;
  readonly plannedTopics?: readonly string[];
}

/**
 * Application service for classroom sessions. Creates a session against a validated
 * Organization (and, when supplied, a validated schedule slot / section / subject / lesson
 * plan), then drives scheduled → delivered → completed | cancelled, capturing planned vs actual
 * delivery. Publishes {@link lessonDelivered} on delivery and {@link classroomSessionCompleted}
 * on completion.
 */
export class ClassroomSessionService {
  private readonly repository: ClassroomSessionRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly scheduleSlots: ScheduleSlotDirectory | undefined;
  private readonly sections: SectionDirectory | undefined;
  private readonly subjects: SubjectDirectory | undefined;
  private readonly lessonPlans: LessonPlanRepository | undefined;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ClassroomSessionServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.scheduleSlots = deps.scheduleSlots;
    this.sections = deps.sections;
    this.subjects = deps.subjects;
    this.lessonPlans = deps.lessonPlans;
    this.events = deps.events;
  }

  async create(input: CreateClassroomSessionInput): Promise<ClassroomSession> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForTeachingError(input.organizationId);
    }
    if (
      input.scheduleSlotId &&
      this.scheduleSlots &&
      !(await this.scheduleSlots.exists(input.tenantId, input.scheduleSlotId))
    ) {
      throw new ScheduleSlotNotFoundForTeachingError(input.scheduleSlotId);
    }
    if (
      input.sectionId &&
      this.sections &&
      !(await this.sections.exists(input.tenantId, input.sectionId))
    ) {
      throw new SectionNotFoundForTeachingError(input.sectionId);
    }
    if (
      input.subjectId &&
      this.subjects &&
      !(await this.subjects.exists(input.tenantId, input.subjectId))
    ) {
      throw new SubjectNotFoundForTeachingError(input.subjectId);
    }
    if (
      input.lessonPlanId &&
      this.lessonPlans &&
      !(await this.lessonPlans.findById(input.tenantId, input.lessonPlanId))
    ) {
      throw new LessonPlanNotFoundError(input.lessonPlanId);
    }
    const session = createClassroomSession(input);
    await this.repository.save(session);
    return session;
  }

  async setPlannedTopics(
    tenantId: TenantId,
    id: Uuid,
    topics: readonly string[],
  ): Promise<ClassroomSession> {
    return this.mutate(tenantId, id, (s) => setPlannedTopics(s, topics));
  }

  async deliver(
    tenantId: TenantId,
    id: Uuid,
    delivery: SessionDelivery,
  ): Promise<ClassroomSession> {
    const delivered = await this.mutate(tenantId, id, (s) => deliverSession(s, delivery));
    await this.emit(lessonDelivered(delivered));
    return delivered;
  }

  async amendDelivery(
    tenantId: TenantId,
    id: Uuid,
    delivery: SessionDelivery,
  ): Promise<ClassroomSession> {
    return this.mutate(tenantId, id, (s) => amendSessionDelivery(s, delivery));
  }

  async recordReflections(
    tenantId: TenantId,
    id: Uuid,
    reflections: string | null,
  ): Promise<ClassroomSession> {
    return this.mutate(tenantId, id, (s) => recordSessionReflections(s, reflections));
  }

  async complete(tenantId: TenantId, id: Uuid): Promise<ClassroomSession> {
    const completed = await this.mutate(tenantId, id, (s) => completeSession(s));
    await this.emit(classroomSessionCompleted(completed));
    return completed;
  }

  async cancel(tenantId: TenantId, id: Uuid): Promise<ClassroomSession> {
    return this.mutate(tenantId, id, (s) => cancelSession(s));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<ClassroomSession> {
    return this.require(tenantId, id);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<ClassroomSession[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  async listForSection(tenantId: TenantId, sectionId: Uuid): Promise<ClassroomSession[]> {
    return this.repository.listBySection(tenantId, sectionId);
  }

  async listForSubject(tenantId: TenantId, subjectId: Uuid): Promise<ClassroomSession[]> {
    return this.repository.listBySubject(tenantId, subjectId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (session: ClassroomSession) => ClassroomSession,
  ): Promise<ClassroomSession> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<ClassroomSession> {
    const session = await this.repository.findById(tenantId, id);
    if (!session) {
      throw new ClassroomSessionNotFoundError(id);
    }
    return session;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
