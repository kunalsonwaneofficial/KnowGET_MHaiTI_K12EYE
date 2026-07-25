import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { scheduleSlotAssigned } from "./academic-scheduling-events";
import {
  ClassNotFoundForSchedulingError,
  DuplicateScheduleSlotError,
  ResourceNotFoundError,
  ScheduleSlotNotFoundError,
  SectionNotFoundForSchedulingError,
  SubjectNotFoundForSchedulingError,
  TeacherNotFoundForSchedulingError,
  TimetableNotFoundError,
  TimetableStateError,
} from "./errors";
import type {
  ClassDirectory,
  ResourceDirectory,
  ScheduleSlotRepository,
  SectionDirectory,
  SubjectDirectory,
  TeacherDirectory,
  TimetableRepository,
} from "./ports";
import {
  assignTeacher,
  assignVenue,
  createScheduleSlot,
  rescheduleSlot,
  type ScheduleSlot,
} from "./schedule-slot";
import type { Timetable } from "./timetable";
import type { Weekday } from "./weekday";

export interface ScheduleSlotServiceDeps {
  readonly repository: ScheduleSlotRepository;
  readonly timetables: TimetableRepository;
  readonly subjects: SubjectDirectory;
  readonly teachers: TeacherDirectory;
  readonly sections: SectionDirectory;
  readonly classes?: ClassDirectory;
  readonly resources?: ResourceDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export interface AssignScheduleSlotInput {
  readonly tenantId: TenantId;
  readonly timetableId: Uuid;
  readonly dayOfWeek: Weekday;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly subjectId: Uuid;
  readonly teacherId: Uuid;
  readonly sectionId: Uuid;
  readonly classId?: Uuid | null;
  readonly venueId?: Uuid | null;
}

/**
 * Application service for schedule slots. Assigns instructional periods into a draft
 * timetable (a published timetable must be revised back to draft first), deriving the slot's
 * organization from its timetable and validating the subject, teacher, section and (when
 * supplied) class and venue through injected directories. Enforces one slot per (timetable,
 * day, start, section) and publishes {@link scheduleSlotAssigned} on assignment.
 */
export class ScheduleSlotService {
  private readonly repository: ScheduleSlotRepository;
  private readonly timetables: TimetableRepository;
  private readonly subjects: SubjectDirectory;
  private readonly teachers: TeacherDirectory;
  private readonly sections: SectionDirectory;
  private readonly classes: ClassDirectory | undefined;
  private readonly resources: ResourceDirectory | undefined;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ScheduleSlotServiceDeps) {
    this.repository = deps.repository;
    this.timetables = deps.timetables;
    this.subjects = deps.subjects;
    this.teachers = deps.teachers;
    this.sections = deps.sections;
    this.classes = deps.classes;
    this.resources = deps.resources;
    this.events = deps.events;
  }

  async assign(input: AssignScheduleSlotInput): Promise<ScheduleSlot> {
    const timetable = await this.requireDraftTimetable(input.tenantId, input.timetableId);
    await this.assertSubject(input.tenantId, input.subjectId);
    await this.assertTeacher(input.tenantId, input.teacherId);
    await this.assertSection(input.tenantId, input.sectionId);
    if (input.classId) {
      await this.assertClass(input.tenantId, input.classId);
    }
    if (input.venueId) {
      await this.assertVenue(input.tenantId, input.venueId);
    }
    if (
      await this.repository.findByPlacement(
        input.tenantId,
        input.timetableId,
        input.dayOfWeek,
        input.startsAt,
        input.sectionId,
      )
    ) {
      throw new DuplicateScheduleSlotError(
        input.timetableId,
        input.dayOfWeek,
        input.startsAt,
        input.sectionId,
      );
    }
    const slot = createScheduleSlot({ ...input, organizationId: timetable.organizationId });
    await this.repository.save(slot);
    await this.emit(scheduleSlotAssigned(slot));
    return slot;
  }

  async setTeacher(tenantId: TenantId, id: Uuid, teacherId: Uuid): Promise<ScheduleSlot> {
    await this.assertTeacher(tenantId, teacherId);
    return this.mutate(tenantId, id, (slot) => assignTeacher(slot, teacherId));
  }

  async setVenue(tenantId: TenantId, id: Uuid, venueId: Uuid | null): Promise<ScheduleSlot> {
    if (venueId) {
      await this.assertVenue(tenantId, venueId);
    }
    return this.mutate(tenantId, id, (slot) => assignVenue(slot, venueId));
  }

  async reschedule(
    tenantId: TenantId,
    id: Uuid,
    dayOfWeek: Weekday,
    startsAt: string,
    endsAt: string,
  ): Promise<ScheduleSlot> {
    const slot = await this.require(tenantId, id);
    await this.requireDraftTimetable(tenantId, slot.timetableId);
    const clash = await this.repository.findByPlacement(
      tenantId,
      slot.timetableId,
      dayOfWeek,
      startsAt,
      slot.sectionId,
    );
    if (clash && clash.id !== slot.id) {
      throw new DuplicateScheduleSlotError(slot.timetableId, dayOfWeek, startsAt, slot.sectionId);
    }
    const updated = rescheduleSlot(slot, dayOfWeek, startsAt, endsAt);
    await this.repository.save(updated);
    return updated;
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const slot = await this.require(tenantId, id);
    await this.requireDraftTimetable(tenantId, slot.timetableId);
    await this.repository.remove(tenantId, id);
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<ScheduleSlot> {
    return this.require(tenantId, id);
  }

  async listForTimetable(tenantId: TenantId, timetableId: Uuid): Promise<ScheduleSlot[]> {
    return this.repository.listByTimetable(tenantId, timetableId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (slot: ScheduleSlot) => ScheduleSlot,
  ): Promise<ScheduleSlot> {
    const current = await this.require(tenantId, id);
    await this.requireDraftTimetable(tenantId, current.timetableId);
    const updated = fn(current);
    await this.repository.save(updated);
    return updated;
  }

  private async requireDraftTimetable(tenantId: TenantId, timetableId: Uuid): Promise<Timetable> {
    const timetable = await this.timetables.findById(tenantId, timetableId);
    if (!timetable) {
      throw new TimetableNotFoundError(timetableId);
    }
    if (timetable.status !== "draft") {
      throw new TimetableStateError(timetable.id, "draft", timetable.status);
    }
    return timetable;
  }

  private async assertSubject(tenantId: TenantId, subjectId: Uuid): Promise<void> {
    if (!(await this.subjects.exists(tenantId, subjectId))) {
      throw new SubjectNotFoundForSchedulingError(subjectId);
    }
  }

  private async assertTeacher(tenantId: TenantId, teacherId: Uuid): Promise<void> {
    if (!(await this.teachers.exists(tenantId, teacherId))) {
      throw new TeacherNotFoundForSchedulingError(teacherId);
    }
  }

  private async assertSection(tenantId: TenantId, sectionId: Uuid): Promise<void> {
    if (!(await this.sections.exists(tenantId, sectionId))) {
      throw new SectionNotFoundForSchedulingError(sectionId);
    }
  }

  private async assertClass(tenantId: TenantId, classId: Uuid): Promise<void> {
    if (this.classes && !(await this.classes.exists(tenantId, classId))) {
      throw new ClassNotFoundForSchedulingError(classId);
    }
  }

  private async assertVenue(tenantId: TenantId, venueId: Uuid): Promise<void> {
    if (this.resources && !(await this.resources.exists(tenantId, venueId))) {
      throw new ResourceNotFoundError(venueId);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<ScheduleSlot> {
    const slot = await this.repository.findById(tenantId, id);
    if (!slot) {
      throw new ScheduleSlotNotFoundError(id);
    }
    return slot;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
