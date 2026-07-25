import type { TenantId, Uuid } from "@knowget/types";
import type { Allocation } from "./allocation";
import type { ConflictAllocation, SchedulingConstraint } from "./conflict";
import type { Resource } from "./resource";
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

// --- Resource repository ---------------------------------------------------------

/** Storage contract for schedulable resources (one per organization + code). */
export interface ResourceRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Resource | null>;
  findByCode(tenantId: TenantId, organizationId: Uuid, code: string): Promise<Resource | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Resource[]>;
  listByTenant(tenantId: TenantId): Promise<Resource[]>;
  save(resource: Resource): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link ResourceRepository} — the default for tests and bootstrap. */
export class InMemoryResourceRepository implements ResourceRepository {
  private readonly byId = new Map<string, Resource>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Resource | null> {
    const resource = this.byId.get(id);
    return resource && resource.tenantId === tenantId ? resource : null;
  }

  async findByCode(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<Resource | null> {
    return (
      [...this.byId.values()].find(
        (r) => r.tenantId === tenantId && r.organizationId === organizationId && r.code === code,
      ) ?? null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Resource[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Resource[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(resource: Resource): Promise<void> {
    this.byId.set(resource.id, resource);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const resource = this.byId.get(id);
    if (resource && resource.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

// --- Allocation repository -------------------------------------------------------

/**
 * Storage contract for allocations. `listForConflict` returns only `allocated` allocations
 * for an organization, so an `AllocationRepository` structurally satisfies
 * {@link AllocationConflictSource} — the timetable service can consume it directly.
 */
export interface AllocationRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Allocation | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Allocation[]>;
  listByResource(tenantId: TenantId, resourceId: Uuid): Promise<Allocation[]>;
  listBySlot(tenantId: TenantId, scheduleSlotId: Uuid): Promise<Allocation[]>;
  listForConflict(tenantId: TenantId, organizationId: Uuid): Promise<Allocation[]>;
  listByTenant(tenantId: TenantId): Promise<Allocation[]>;
  save(allocation: Allocation): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link AllocationRepository} — the default for tests and bootstrap. */
export class InMemoryAllocationRepository implements AllocationRepository {
  private readonly byId = new Map<string, Allocation>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Allocation | null> {
    const allocation = this.byId.get(id);
    return allocation && allocation.tenantId === tenantId ? allocation : null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Allocation[]> {
    return [...this.byId.values()].filter(
      (a) => a.tenantId === tenantId && a.organizationId === organizationId,
    );
  }

  async listByResource(tenantId: TenantId, resourceId: Uuid): Promise<Allocation[]> {
    return [...this.byId.values()].filter(
      (a) => a.tenantId === tenantId && a.resourceId === resourceId,
    );
  }

  async listBySlot(tenantId: TenantId, scheduleSlotId: Uuid): Promise<Allocation[]> {
    return [...this.byId.values()].filter(
      (a) => a.tenantId === tenantId && a.scheduleSlotId === scheduleSlotId,
    );
  }

  async listForConflict(tenantId: TenantId, organizationId: Uuid): Promise<Allocation[]> {
    return [...this.byId.values()].filter(
      (a) =>
        a.tenantId === tenantId && a.organizationId === organizationId && a.status === "allocated",
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Allocation[]> {
    return [...this.byId.values()].filter((a) => a.tenantId === tenantId);
  }

  async save(allocation: Allocation): Promise<void> {
    this.byId.set(allocation.id, allocation);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const allocation = this.byId.get(id);
    if (allocation && allocation.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
