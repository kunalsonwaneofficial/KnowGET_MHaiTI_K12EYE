import type { TenantId, Uuid } from "@knowget/types";
import type { AcademicPlan } from "./academic-plan";
import type { LearningResource } from "./learning-resource";
import type { LessonPlan } from "./lesson-plan";
import type { UnitPlan } from "./unit-plan";

// --- Cross-domain directory ports ------------------------------------------------
// Existence checks over other bounded contexts, so the pure package never imports them.

/** Does this organization exist in the tenant? (P2-D01-M01) */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/** Does this subject exist in the tenant? (P2-D06) */
export interface SubjectDirectory {
  exists(tenantId: TenantId, subjectId: Uuid): Promise<boolean>;
}

/** Does this section exist in the tenant? (P2-D06) */
export interface SectionDirectory {
  exists(tenantId: TenantId, sectionId: Uuid): Promise<boolean>;
}

/** Does this curriculum framework exist in the tenant? (P2-D06) */
export interface CurriculumDirectory {
  exists(tenantId: TenantId, curriculumFrameworkId: Uuid): Promise<boolean>;
}

/** Does this schedule slot exist in the tenant? (P2-D07) */
export interface ScheduleSlotDirectory {
  exists(tenantId: TenantId, scheduleSlotId: Uuid): Promise<boolean>;
}

/** Does this student exist in the tenant? (P2-D03) */
export interface StudentDirectory {
  exists(tenantId: TenantId, studentId: Uuid): Promise<boolean>;
}

// --- Academic plan repository ----------------------------------------------------

/** Storage contract for academic plans. */
export interface AcademicPlanRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<AcademicPlan | null>;
  findByCode(tenantId: TenantId, organizationId: Uuid, code: string): Promise<AcademicPlan | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AcademicPlan[]>;
  listByTenant(tenantId: TenantId): Promise<AcademicPlan[]>;
  save(plan: AcademicPlan): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link AcademicPlanRepository} — the default for tests and bootstrap. */
export class InMemoryAcademicPlanRepository implements AcademicPlanRepository {
  private readonly byId = new Map<string, AcademicPlan>();

  async findById(tenantId: TenantId, id: Uuid): Promise<AcademicPlan | null> {
    const plan = this.byId.get(id);
    return plan && plan.tenantId === tenantId ? plan : null;
  }

  async findByCode(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<AcademicPlan | null> {
    return (
      [...this.byId.values()].find(
        (p) => p.tenantId === tenantId && p.organizationId === organizationId && p.code === code,
      ) ?? null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AcademicPlan[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<AcademicPlan[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(plan: AcademicPlan): Promise<void> {
    this.byId.set(plan.id, plan);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const plan = this.byId.get(id);
    if (plan && plan.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

// --- Unit plan repository ---------------------------------------------------------

/** Storage contract for unit plans. `listBySubject` feeds the intelligence engine's scope. */
export interface UnitPlanRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<UnitPlan | null>;
  listBySubject(tenantId: TenantId, subjectId: Uuid): Promise<UnitPlan[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<UnitPlan[]>;
  listByTenant(tenantId: TenantId): Promise<UnitPlan[]>;
  save(unit: UnitPlan): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link UnitPlanRepository} — the default for tests and bootstrap. */
export class InMemoryUnitPlanRepository implements UnitPlanRepository {
  private readonly byId = new Map<string, UnitPlan>();

  async findById(tenantId: TenantId, id: Uuid): Promise<UnitPlan | null> {
    const unit = this.byId.get(id);
    return unit && unit.tenantId === tenantId ? unit : null;
  }

  async listBySubject(tenantId: TenantId, subjectId: Uuid): Promise<UnitPlan[]> {
    return [...this.byId.values()].filter(
      (u) => u.tenantId === tenantId && u.subjectId === subjectId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<UnitPlan[]> {
    return [...this.byId.values()].filter(
      (u) => u.tenantId === tenantId && u.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<UnitPlan[]> {
    return [...this.byId.values()].filter((u) => u.tenantId === tenantId);
  }

  async save(unit: UnitPlan): Promise<void> {
    this.byId.set(unit.id, unit);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const unit = this.byId.get(id);
    if (unit && unit.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

// --- Lesson plan repository -------------------------------------------------------

/** Storage contract for lesson plans. */
export interface LessonPlanRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<LessonPlan | null>;
  listBySubject(tenantId: TenantId, subjectId: Uuid): Promise<LessonPlan[]>;
  listByUnit(tenantId: TenantId, unitPlanId: Uuid): Promise<LessonPlan[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<LessonPlan[]>;
  listByTenant(tenantId: TenantId): Promise<LessonPlan[]>;
  save(plan: LessonPlan): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link LessonPlanRepository} — the default for tests and bootstrap. */
export class InMemoryLessonPlanRepository implements LessonPlanRepository {
  private readonly byId = new Map<string, LessonPlan>();

  async findById(tenantId: TenantId, id: Uuid): Promise<LessonPlan | null> {
    const plan = this.byId.get(id);
    return plan && plan.tenantId === tenantId ? plan : null;
  }

  async listBySubject(tenantId: TenantId, subjectId: Uuid): Promise<LessonPlan[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.subjectId === subjectId,
    );
  }

  async listByUnit(tenantId: TenantId, unitPlanId: Uuid): Promise<LessonPlan[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.unitPlanId === unitPlanId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<LessonPlan[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<LessonPlan[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(plan: LessonPlan): Promise<void> {
    this.byId.set(plan.id, plan);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const plan = this.byId.get(id);
    if (plan && plan.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

// --- Learning resource repository -------------------------------------------------

/** Storage contract for learning resources. */
export interface LearningResourceRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<LearningResource | null>;
  listBySubject(tenantId: TenantId, subjectId: Uuid): Promise<LearningResource[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<LearningResource[]>;
  listByTenant(tenantId: TenantId): Promise<LearningResource[]>;
  save(resource: LearningResource): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link LearningResourceRepository} — the default for tests and bootstrap. */
export class InMemoryLearningResourceRepository implements LearningResourceRepository {
  private readonly byId = new Map<string, LearningResource>();

  async findById(tenantId: TenantId, id: Uuid): Promise<LearningResource | null> {
    const resource = this.byId.get(id);
    return resource && resource.tenantId === tenantId ? resource : null;
  }

  async listBySubject(tenantId: TenantId, subjectId: Uuid): Promise<LearningResource[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.subjectId === subjectId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<LearningResource[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<LearningResource[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(resource: LearningResource): Promise<void> {
    this.byId.set(resource.id, resource);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const resource = this.byId.get(id);
    if (resource && resource.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
