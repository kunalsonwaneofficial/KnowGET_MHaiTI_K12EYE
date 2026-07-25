import type { TenantId, Uuid } from "@knowget/types";
import type { ConflictAllocation, SchedulingConstraint } from "./conflict";
import type { ScheduleSlot } from "./schedule-slot";
import type { Timetable } from "./timetable";

// --- Cross-domain directory ports ------------------------------------------------
// Existence checks over other bounded contexts, so the pure package never imports them.

/** Does this organization exist in the tenant? (P2-D01-M01) */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/** Does this grade exist in the tenant? (P2-D06) */
export interface GradeDirectory {
  exists(tenantId: TenantId, gradeId: Uuid): Promise<boolean>;
}

/** Does this class exist in the tenant? (P2-D06) */
export interface ClassDirectory {
  exists(tenantId: TenantId, classId: Uuid): Promise<boolean>;
}

/** Does this section exist in the tenant? (P2-D06) */
export interface SectionDirectory {
  exists(tenantId: TenantId, sectionId: Uuid): Promise<boolean>;
}

/** Does this subject exist in the tenant? (P2-D06) */
export interface SubjectDirectory {
  exists(tenantId: TenantId, subjectId: Uuid): Promise<boolean>;
}

/** Does this teacher (Person, P2-D01-M02) exist in the tenant? */
export interface TeacherDirectory {
  exists(tenantId: TenantId, teacherId: Uuid): Promise<boolean>;
}

/** Does this schedulable resource exist in the tenant? (backed by the in-package resource repo) */
export interface ResourceDirectory {
  exists(tenantId: TenantId, resourceId: Uuid): Promise<boolean>;
}

// --- Conflict-input source ports -------------------------------------------------
// The timetable service gathers resource allocations and active scheduling constraints
// through these narrow ports when validating a schedule, so publication is gated on the
// full conflict picture without the timetable service depending on those repositories'
// concrete shapes. Both return the conflict engine's pure view types.

/** Supplies the active resource allocations for an organization, for conflict detection. */
export interface AllocationConflictSource {
  listForConflict(tenantId: TenantId, organizationId: Uuid): Promise<ConflictAllocation[]>;
}

/** Supplies the active scheduling constraints for an organization, for conflict detection. */
export interface SchedulingConstraintSource {
  listActiveForConflict(tenantId: TenantId, organizationId: Uuid): Promise<SchedulingConstraint[]>;
}

// --- Timetable repository --------------------------------------------------------

/** Storage contract for timetables (one per organization + code). */
export interface TimetableRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Timetable | null>;
  findByCode(tenantId: TenantId, organizationId: Uuid, code: string): Promise<Timetable | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Timetable[]>;
  listByTenant(tenantId: TenantId): Promise<Timetable[]>;
  /** All timetables for an (organization, academic year, term) — used to find conflict peers. */
  listByPeriod(
    tenantId: TenantId,
    organizationId: Uuid,
    academicYear: string,
    term: string | null,
  ): Promise<Timetable[]>;
  save(timetable: Timetable): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link TimetableRepository} — the default for tests and bootstrap. */
export class InMemoryTimetableRepository implements TimetableRepository {
  private readonly byId = new Map<string, Timetable>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Timetable | null> {
    const timetable = this.byId.get(id);
    return timetable && timetable.tenantId === tenantId ? timetable : null;
  }

  async findByCode(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<Timetable | null> {
    return (
      [...this.byId.values()].find(
        (t) => t.tenantId === tenantId && t.organizationId === organizationId && t.code === code,
      ) ?? null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Timetable[]> {
    return [...this.byId.values()].filter(
      (t) => t.tenantId === tenantId && t.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Timetable[]> {
    return [...this.byId.values()].filter((t) => t.tenantId === tenantId);
  }

  async listByPeriod(
    tenantId: TenantId,
    organizationId: Uuid,
    academicYear: string,
    term: string | null,
  ): Promise<Timetable[]> {
    return [...this.byId.values()].filter(
      (t) =>
        t.tenantId === tenantId &&
        t.organizationId === organizationId &&
        t.academicYear === academicYear &&
        t.term === term,
    );
  }

  async save(timetable: Timetable): Promise<void> {
    this.byId.set(timetable.id, timetable);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const timetable = this.byId.get(id);
    if (timetable && timetable.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

// --- Schedule slot repository ----------------------------------------------------

/** Storage contract for schedule slots (belonging to a timetable). */
export interface ScheduleSlotRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<ScheduleSlot | null>;
  /** A slot at a given placement (timetable, day, start, section) — for duplicate detection. */
  findByPlacement(
    tenantId: TenantId,
    timetableId: Uuid,
    dayOfWeek: string,
    startsAt: string,
    sectionId: Uuid,
  ): Promise<ScheduleSlot | null>;
  listByTimetable(tenantId: TenantId, timetableId: Uuid): Promise<ScheduleSlot[]>;
  listByTenant(tenantId: TenantId): Promise<ScheduleSlot[]>;
  save(slot: ScheduleSlot): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link ScheduleSlotRepository} — the default for tests and bootstrap. */
export class InMemoryScheduleSlotRepository implements ScheduleSlotRepository {
  private readonly byId = new Map<string, ScheduleSlot>();

  async findById(tenantId: TenantId, id: Uuid): Promise<ScheduleSlot | null> {
    const slot = this.byId.get(id);
    return slot && slot.tenantId === tenantId ? slot : null;
  }

  async findByPlacement(
    tenantId: TenantId,
    timetableId: Uuid,
    dayOfWeek: string,
    startsAt: string,
    sectionId: Uuid,
  ): Promise<ScheduleSlot | null> {
    return (
      [...this.byId.values()].find(
        (s) =>
          s.tenantId === tenantId &&
          s.timetableId === timetableId &&
          s.dayOfWeek === dayOfWeek &&
          s.startsAt === startsAt &&
          s.sectionId === sectionId,
      ) ?? null
    );
  }

  async listByTimetable(tenantId: TenantId, timetableId: Uuid): Promise<ScheduleSlot[]> {
    return [...this.byId.values()].filter(
      (s) => s.tenantId === tenantId && s.timetableId === timetableId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<ScheduleSlot[]> {
    return [...this.byId.values()].filter((s) => s.tenantId === tenantId);
  }

  async save(slot: ScheduleSlot): Promise<void> {
    this.byId.set(slot.id, slot);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const slot = this.byId.get(id);
    if (slot && slot.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
