import type { TenantId, Uuid } from "@knowget/types";
import type { CoachingEngagement } from "./coaching-engagement";
import type { CoachingSession } from "./coaching-session";
import type { CompetencyFramework } from "./competency-framework";
import type { DevelopmentGoal } from "./development-goal";
import type { DevelopmentRequirement } from "./development-requirement";
import type { FacultyProfile } from "./faculty-profile";
import type { Observation } from "./observation";
import type { ProfessionalLearningActivity } from "./professional-learning-activity";

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node exist in the
 * tenant? Frameworks attach to it.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Read model over the workforce domain (P2-D12): a staff member observed, coached or developed here
 * is an Employee; the faculty domain links to it and never depends on `@knowget/workforce` directly.
 * `exists` answers presence; `organizationOf` resolves the employee's organization (or `null` if the
 * employee is unknown) so records that attach directly to an employee derive their org from it.
 */
export interface EmployeeDirectory {
  exists(tenantId: TenantId, employeeId: Uuid): Promise<boolean>;
  organizationOf(tenantId: TenantId, employeeId: Uuid): Promise<Uuid | null>;
}

/** Storage contract for competency frameworks. Tenant-scoped (explicit argument + RLS). */
export interface CompetencyFrameworkRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<CompetencyFramework | null>;
  findByCode(tenantId: TenantId, code: string): Promise<CompetencyFramework | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<CompetencyFramework[]>;
  listByTenant(tenantId: TenantId): Promise<CompetencyFramework[]>;
  save(framework: CompetencyFramework): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link CompetencyFrameworkRepository} — the default for tests and bootstrap. */
export class InMemoryCompetencyFrameworkRepository implements CompetencyFrameworkRepository {
  private readonly byId = new Map<string, CompetencyFramework>();

  async findById(tenantId: TenantId, id: Uuid): Promise<CompetencyFramework | null> {
    const framework = this.byId.get(id);
    return framework && framework.tenantId === tenantId ? framework : null;
  }

  async findByCode(tenantId: TenantId, code: string): Promise<CompetencyFramework | null> {
    return [...this.byId.values()].find((f) => f.tenantId === tenantId && f.code === code) ?? null;
  }

  async listByOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<CompetencyFramework[]> {
    return [...this.byId.values()].filter(
      (f) => f.tenantId === tenantId && f.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<CompetencyFramework[]> {
    return [...this.byId.values()].filter((f) => f.tenantId === tenantId);
  }

  async save(framework: CompetencyFramework): Promise<void> {
    this.byId.set(framework.id, framework);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const framework = this.byId.get(id);
    if (framework && framework.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for observations. Tenant-scoped (explicit argument + RLS). */
export interface ObservationRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Observation | null>;
  listByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<Observation[]>;
  listByObserver(tenantId: TenantId, observerId: Uuid): Promise<Observation[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Observation[]>;
  listByTenant(tenantId: TenantId): Promise<Observation[]>;
  save(observation: Observation): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link ObservationRepository} — the default for tests and bootstrap. */
export class InMemoryObservationRepository implements ObservationRepository {
  private readonly byId = new Map<string, Observation>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Observation | null> {
    const observation = this.byId.get(id);
    return observation && observation.tenantId === tenantId ? observation : null;
  }

  async listByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<Observation[]> {
    return [...this.byId.values()].filter(
      (o) => o.tenantId === tenantId && o.employeeId === employeeId,
    );
  }

  async listByObserver(tenantId: TenantId, observerId: Uuid): Promise<Observation[]> {
    return [...this.byId.values()].filter(
      (o) => o.tenantId === tenantId && o.observerId === observerId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Observation[]> {
    return [...this.byId.values()].filter(
      (o) => o.tenantId === tenantId && o.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Observation[]> {
    return [...this.byId.values()].filter((o) => o.tenantId === tenantId);
  }

  async save(observation: Observation): Promise<void> {
    this.byId.set(observation.id, observation);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const observation = this.byId.get(id);
    if (observation && observation.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for coaching engagements. Tenant-scoped (explicit argument + RLS). */
export interface CoachingEngagementRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<CoachingEngagement | null>;
  listByCoachee(tenantId: TenantId, coacheeId: Uuid): Promise<CoachingEngagement[]>;
  listByCoach(tenantId: TenantId, coachId: Uuid): Promise<CoachingEngagement[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<CoachingEngagement[]>;
  listByTenant(tenantId: TenantId): Promise<CoachingEngagement[]>;
  save(engagement: CoachingEngagement): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link CoachingEngagementRepository} — the default for tests and bootstrap. */
export class InMemoryCoachingEngagementRepository implements CoachingEngagementRepository {
  private readonly byId = new Map<string, CoachingEngagement>();

  async findById(tenantId: TenantId, id: Uuid): Promise<CoachingEngagement | null> {
    const engagement = this.byId.get(id);
    return engagement && engagement.tenantId === tenantId ? engagement : null;
  }

  async listByCoachee(tenantId: TenantId, coacheeId: Uuid): Promise<CoachingEngagement[]> {
    return [...this.byId.values()].filter(
      (e) => e.tenantId === tenantId && e.coacheeId === coacheeId,
    );
  }

  async listByCoach(tenantId: TenantId, coachId: Uuid): Promise<CoachingEngagement[]> {
    return [...this.byId.values()].filter((e) => e.tenantId === tenantId && e.coachId === coachId);
  }

  async listByOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<CoachingEngagement[]> {
    return [...this.byId.values()].filter(
      (e) => e.tenantId === tenantId && e.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<CoachingEngagement[]> {
    return [...this.byId.values()].filter((e) => e.tenantId === tenantId);
  }

  async save(engagement: CoachingEngagement): Promise<void> {
    this.byId.set(engagement.id, engagement);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const engagement = this.byId.get(id);
    if (engagement && engagement.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for coaching sessions. Tenant-scoped (explicit argument + RLS). */
export interface CoachingSessionRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<CoachingSession | null>;
  listByEngagement(tenantId: TenantId, engagementId: Uuid): Promise<CoachingSession[]>;
  listByTenant(tenantId: TenantId): Promise<CoachingSession[]>;
  save(session: CoachingSession): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link CoachingSessionRepository} — the default for tests and bootstrap. */
export class InMemoryCoachingSessionRepository implements CoachingSessionRepository {
  private readonly byId = new Map<string, CoachingSession>();

  async findById(tenantId: TenantId, id: Uuid): Promise<CoachingSession | null> {
    const session = this.byId.get(id);
    return session && session.tenantId === tenantId ? session : null;
  }

  async listByEngagement(tenantId: TenantId, engagementId: Uuid): Promise<CoachingSession[]> {
    return [...this.byId.values()].filter(
      (s) => s.tenantId === tenantId && s.engagementId === engagementId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<CoachingSession[]> {
    return [...this.byId.values()].filter((s) => s.tenantId === tenantId);
  }

  async save(session: CoachingSession): Promise<void> {
    this.byId.set(session.id, session);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const session = this.byId.get(id);
    if (session && session.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for development requirements. Tenant-scoped (explicit argument + RLS). */
export interface DevelopmentRequirementRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<DevelopmentRequirement | null>;
  findByScope(
    tenantId: TenantId,
    employeeId: Uuid,
    category: string,
    period: string,
  ): Promise<DevelopmentRequirement | null>;
  listByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<DevelopmentRequirement[]>;
  listByTenant(tenantId: TenantId): Promise<DevelopmentRequirement[]>;
  save(requirement: DevelopmentRequirement): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link DevelopmentRequirementRepository} — the default for tests and bootstrap. */
export class InMemoryDevelopmentRequirementRepository implements DevelopmentRequirementRepository {
  private readonly byId = new Map<string, DevelopmentRequirement>();

  async findById(tenantId: TenantId, id: Uuid): Promise<DevelopmentRequirement | null> {
    const requirement = this.byId.get(id);
    return requirement && requirement.tenantId === tenantId ? requirement : null;
  }

  async findByScope(
    tenantId: TenantId,
    employeeId: Uuid,
    category: string,
    period: string,
  ): Promise<DevelopmentRequirement | null> {
    return (
      [...this.byId.values()].find(
        (r) =>
          r.tenantId === tenantId &&
          r.employeeId === employeeId &&
          r.category === category &&
          r.period === period,
      ) ?? null
    );
  }

  async listByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<DevelopmentRequirement[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.employeeId === employeeId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<DevelopmentRequirement[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(requirement: DevelopmentRequirement): Promise<void> {
    this.byId.set(requirement.id, requirement);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const requirement = this.byId.get(id);
    if (requirement && requirement.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for professional-learning activities. Tenant-scoped (explicit argument + RLS). */
export interface ProfessionalLearningActivityRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<ProfessionalLearningActivity | null>;
  listByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<ProfessionalLearningActivity[]>;
  listByTenant(tenantId: TenantId): Promise<ProfessionalLearningActivity[]>;
  save(activity: ProfessionalLearningActivity): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link ProfessionalLearningActivityRepository} — the default for tests and bootstrap. */
export class InMemoryProfessionalLearningActivityRepository implements ProfessionalLearningActivityRepository {
  private readonly byId = new Map<string, ProfessionalLearningActivity>();

  async findById(tenantId: TenantId, id: Uuid): Promise<ProfessionalLearningActivity | null> {
    const activity = this.byId.get(id);
    return activity && activity.tenantId === tenantId ? activity : null;
  }

  async listByEmployee(
    tenantId: TenantId,
    employeeId: Uuid,
  ): Promise<ProfessionalLearningActivity[]> {
    return [...this.byId.values()].filter(
      (a) => a.tenantId === tenantId && a.employeeId === employeeId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<ProfessionalLearningActivity[]> {
    return [...this.byId.values()].filter((a) => a.tenantId === tenantId);
  }

  async save(activity: ProfessionalLearningActivity): Promise<void> {
    this.byId.set(activity.id, activity);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const activity = this.byId.get(id);
    if (activity && activity.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for development goals. Tenant-scoped (explicit argument + RLS). */
export interface DevelopmentGoalRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<DevelopmentGoal | null>;
  listByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<DevelopmentGoal[]>;
  listByTenant(tenantId: TenantId): Promise<DevelopmentGoal[]>;
  save(goal: DevelopmentGoal): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link DevelopmentGoalRepository} — the default for tests and bootstrap. */
export class InMemoryDevelopmentGoalRepository implements DevelopmentGoalRepository {
  private readonly byId = new Map<string, DevelopmentGoal>();

  async findById(tenantId: TenantId, id: Uuid): Promise<DevelopmentGoal | null> {
    const goal = this.byId.get(id);
    return goal && goal.tenantId === tenantId ? goal : null;
  }

  async listByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<DevelopmentGoal[]> {
    return [...this.byId.values()].filter(
      (g) => g.tenantId === tenantId && g.employeeId === employeeId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<DevelopmentGoal[]> {
    return [...this.byId.values()].filter((g) => g.tenantId === tenantId);
  }

  async save(goal: DevelopmentGoal): Promise<void> {
    this.byId.set(goal.id, goal);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const goal = this.byId.get(id);
    if (goal && goal.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for faculty profiles (one per employee). Tenant-scoped. */
export interface FacultyProfileRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<FacultyProfile | null>;
  findByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<FacultyProfile | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<FacultyProfile[]>;
  listByTenant(tenantId: TenantId): Promise<FacultyProfile[]>;
  save(profile: FacultyProfile): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link FacultyProfileRepository} — the default for tests and bootstrap. */
export class InMemoryFacultyProfileRepository implements FacultyProfileRepository {
  private readonly byId = new Map<string, FacultyProfile>();

  async findById(tenantId: TenantId, id: Uuid): Promise<FacultyProfile | null> {
    const profile = this.byId.get(id);
    return profile && profile.tenantId === tenantId ? profile : null;
  }

  async findByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<FacultyProfile | null> {
    return (
      [...this.byId.values()].find((p) => p.tenantId === tenantId && p.employeeId === employeeId) ??
      null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<FacultyProfile[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<FacultyProfile[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(profile: FacultyProfile): Promise<void> {
    this.byId.set(profile.id, profile);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const profile = this.byId.get(id);
    if (profile && profile.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
