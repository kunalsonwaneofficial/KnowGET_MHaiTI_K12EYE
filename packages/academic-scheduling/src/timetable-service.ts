import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  conflictDetected,
  timetableCreated,
  timetablePublished,
  timetableRevised,
} from "./academic-scheduling-events";
import type { ConflictDetectionInput, DetectedConflict } from "./conflict";
import { detectConflicts } from "./conflict-engine";
import {
  ClassNotFoundForSchedulingError,
  DuplicateTimetableError,
  GradeNotFoundForSchedulingError,
  OrganizationNotFoundForSchedulingError,
  ScheduleConflictError,
  SectionNotFoundForSchedulingError,
  TimetableNotFoundError,
} from "./errors";
import type {
  AllocationConflictSource,
  ClassDirectory,
  GradeDirectory,
  OrganizationDirectory,
  ScheduleSlotRepository,
  SchedulingConstraintSource,
  SectionDirectory,
  TimetableRepository,
} from "./ports";
import {
  archiveTimetable,
  createTimetable,
  publishTimetable,
  renameTimetable,
  reviseTimetable,
  type Timetable,
} from "./timetable";

export interface TimetableServiceDeps {
  readonly repository: TimetableRepository;
  readonly slots: ScheduleSlotRepository;
  readonly organizations: OrganizationDirectory;
  readonly grades: GradeDirectory;
  readonly classes?: ClassDirectory;
  readonly sections?: SectionDirectory;
  /** Resource allocations for conflict detection (wired once the allocation domain exists). */
  readonly allocations?: AllocationConflictSource;
  /** Active scheduling constraints for conflict detection (wired once policies exist). */
  readonly policies?: SchedulingConstraintSource;
  readonly events?: Pick<EventBus, "publish">;
}

export interface CreateTimetableInput {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly academicYear: string;
  readonly gradeId: Uuid;
  readonly term?: string | null;
  readonly classId?: Uuid | null;
  readonly sectionId?: Uuid | null;
}

/**
 * Application service for timetables. Creates at most one timetable per (organization, code)
 * against a validated Organization and Grade (and Class/Section when supplied), manages the
 * version-controlled draft → published → archived lifecycle, and — critically — refuses to
 * publish a schedule the conflict engine rejects. Publication considers the timetable's own
 * slots together with those of every other published timetable in the same academic
 * year/term, plus active resource allocations and scheduling policies, so a teacher, section
 * or venue can never be double-booked across the published grid.
 */
export class TimetableService {
  private readonly repository: TimetableRepository;
  private readonly slots: ScheduleSlotRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly grades: GradeDirectory;
  private readonly classes: ClassDirectory | undefined;
  private readonly sections: SectionDirectory | undefined;
  private readonly allocations: AllocationConflictSource | undefined;
  private readonly policies: SchedulingConstraintSource | undefined;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: TimetableServiceDeps) {
    this.repository = deps.repository;
    this.slots = deps.slots;
    this.organizations = deps.organizations;
    this.grades = deps.grades;
    this.classes = deps.classes;
    this.sections = deps.sections;
    this.allocations = deps.allocations;
    this.policies = deps.policies;
    this.events = deps.events;
  }

  async create(input: CreateTimetableInput): Promise<Timetable> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForSchedulingError(input.organizationId);
    }
    if (!(await this.grades.exists(input.tenantId, input.gradeId))) {
      throw new GradeNotFoundForSchedulingError(input.gradeId);
    }
    if (
      input.classId &&
      this.classes &&
      !(await this.classes.exists(input.tenantId, input.classId))
    ) {
      throw new ClassNotFoundForSchedulingError(input.classId);
    }
    if (
      input.sectionId &&
      this.sections &&
      !(await this.sections.exists(input.tenantId, input.sectionId))
    ) {
      throw new SectionNotFoundForSchedulingError(input.sectionId);
    }
    if (await this.repository.findByCode(input.tenantId, input.organizationId, input.code)) {
      throw new DuplicateTimetableError(input.organizationId, input.code);
    }
    const timetable = createTimetable(input);
    await this.repository.save(timetable);
    await this.emit(timetableCreated(timetable));
    return timetable;
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<Timetable> {
    const timetable = renameTimetable(await this.require(tenantId, id), name);
    await this.repository.save(timetable);
    return timetable;
  }

  /**
   * Validate a timetable without publishing it — the Conflict Analysis surface. Returns
   * every conflict the engine finds for the current draft; an empty list means it is safe
   * to publish.
   */
  async validate(tenantId: TenantId, id: Uuid): Promise<DetectedConflict[]> {
    const timetable = await this.require(tenantId, id);
    return detectConflicts(await this.gatherConflictInput(timetable));
  }

  /**
   * Publish a draft timetable, gated by the conflict engine. If any conflict is found, a
   * {@link conflictDetected} event is emitted and publication is refused with a
   * {@link ScheduleConflictError} carrying the offending conflicts.
   */
  async publish(tenantId: TenantId, id: Uuid): Promise<Timetable> {
    const timetable = await this.require(tenantId, id);
    const conflicts = detectConflicts(await this.gatherConflictInput(timetable));
    if (conflicts.length > 0) {
      const kinds = [...new Set(conflicts.map((c) => c.kind))];
      await this.emit(conflictDetected(timetable, kinds, conflicts.length));
      throw new ScheduleConflictError(timetable.id, conflicts);
    }
    const published = publishTimetable(timetable);
    await this.repository.save(published);
    await this.emit(timetablePublished(published));
    return published;
  }

  async revise(tenantId: TenantId, id: Uuid, note: string): Promise<Timetable> {
    const timetable = reviseTimetable(await this.require(tenantId, id), note);
    await this.repository.save(timetable);
    await this.emit(timetableRevised(timetable));
    return timetable;
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<Timetable> {
    const timetable = archiveTimetable(await this.require(tenantId, id));
    await this.repository.save(timetable);
    return timetable;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Timetable> {
    return this.require(tenantId, id);
  }

  async getByCode(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<Timetable | null> {
    return this.repository.findByCode(tenantId, organizationId, code);
  }

  async list(tenantId: TenantId): Promise<Timetable[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Timetable[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  /**
   * Assemble the full conflict-detection input for a timetable: its own slots plus the slots
   * of every other published timetable in the same academic year/term, together with the
   * organization's active allocations and scheduling constraints (when those sources are
   * wired).
   */
  private async gatherConflictInput(timetable: Timetable): Promise<ConflictDetectionInput> {
    const ownSlots = await this.slots.listByTimetable(timetable.tenantId, timetable.id);
    const peers = (
      await this.repository.listByPeriod(
        timetable.tenantId,
        timetable.organizationId,
        timetable.academicYear,
        timetable.term,
      )
    ).filter((peer) => peer.id !== timetable.id && peer.status === "published");
    const peerSlots = (
      await Promise.all(
        peers.map((peer) => this.slots.listByTimetable(timetable.tenantId, peer.id)),
      )
    ).flat();
    const allocations = this.allocations
      ? await this.allocations.listForConflict(timetable.tenantId, timetable.organizationId)
      : [];
    const constraints = this.policies
      ? await this.policies.listActiveForConflict(timetable.tenantId, timetable.organizationId)
      : [];
    return { slots: [...ownSlots, ...peerSlots], allocations, constraints };
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Timetable> {
    const timetable = await this.repository.findById(tenantId, id);
    if (!timetable) {
      throw new TimetableNotFoundError(id);
    }
    return timetable;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
