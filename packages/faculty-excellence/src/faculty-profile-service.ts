import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { computeDevelopmentLedger } from "./development-ledger";
import { EmployeeNotFoundForFacultyError, FacultyProfileNotFoundError } from "./errors";
import { facultyProfileRefreshed } from "./faculty-events";
import { computeFacultyGrowth, summarizeFaculty } from "./faculty-growth";
import {
  createFacultyProfile,
  type FacultyProfile,
  refreshFacultyProfile,
} from "./faculty-profile";
import type { FacultyMemberView, FacultySummary } from "./faculty-view";
import { observationCompetencyKeys } from "./observation";
import type {
  DevelopmentGoalRepository,
  DevelopmentRequirementRepository,
  EmployeeDirectory,
  FacultyProfileRepository,
  ObservationRepository,
  ProfessionalLearningActivityRepository,
} from "./ports";

export interface FacultyProfileServiceDeps {
  readonly repository: FacultyProfileRepository;
  readonly employees: EmployeeDirectory;
  readonly observations: ObservationRepository;
  readonly goals: DevelopmentGoalRepository;
  readonly requirements: DevelopmentRequirementRepository;
  readonly activities: ProfessionalLearningActivityRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for the faculty profile — the descriptive, AI-ready indicator snapshot per
 * staff member, and the leadership-facing organization rollup. It gathers the member's acknowledged
 * observations, development-goal progress and PD compliance (via the pure development-ledger), runs
 * the pure {@link computeFacultyGrowth} engine, and refreshes the one-per-employee profile — every
 * value explainable, nothing predicted (prediction is deferred to the intelligence core, P2-D28).
 */
export class FacultyProfileService {
  private readonly repository: FacultyProfileRepository;
  private readonly employees: EmployeeDirectory;
  private readonly observations: ObservationRepository;
  private readonly goals: DevelopmentGoalRepository;
  private readonly requirements: DevelopmentRequirementRepository;
  private readonly activities: ProfessionalLearningActivityRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: FacultyProfileServiceDeps) {
    this.repository = deps.repository;
    this.employees = deps.employees;
    this.observations = deps.observations;
    this.goals = deps.goals;
    this.requirements = deps.requirements;
    this.activities = deps.activities;
    this.events = deps.events;
  }

  /**
   * Refresh (or first create) a staff member's faculty profile. PD compliance is scoped to `period`
   * (defaulting to the current calendar year is the caller's responsibility — pass it explicitly).
   */
  async refresh(tenantId: TenantId, employeeId: Uuid, period: string): Promise<FacultyProfile> {
    const organizationId = await this.employees.organizationOf(tenantId, employeeId);
    if (organizationId === null) {
      throw new EmployeeNotFoundForFacultyError(employeeId);
    }
    const [observations, goals, requirements, activities] = await Promise.all([
      this.observations.listByEmployee(tenantId, employeeId),
      this.goals.listByEmployee(tenantId, employeeId),
      this.requirements.listByEmployee(tenantId, employeeId),
      this.activities.listByEmployee(tenantId, employeeId),
    ]);
    const ledger = computeDevelopmentLedger(
      requirements
        .filter((r) => r.period === period)
        .map((r) => ({ category: r.category, requiredHours: r.requiredHours })),
      activities
        .filter((a) => a.period === period)
        .map((a) => ({ category: a.category, hours: a.hours, status: a.status })),
    );
    const indicators = computeFacultyGrowth({
      observations: observations.map((o) => ({
        status: o.status,
        overallRating: o.overallRating,
        competencyKeys: observationCompetencyKeys(o),
      })),
      goals: goals.map((g) => ({ status: g.status })),
      developmentComplianceRate: ledger.complianceRate,
    });
    const existing =
      (await this.repository.findByEmployee(tenantId, employeeId)) ??
      createFacultyProfile({ tenantId, organizationId, employeeId });
    const refreshed = refreshFacultyProfile(existing, indicators);
    await this.repository.save(refreshed);
    await this.emit(facultyProfileRefreshed(refreshed));
    return refreshed;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<FacultyProfile> {
    const profile = await this.repository.findById(tenantId, id);
    if (!profile) {
      throw new FacultyProfileNotFoundError(id);
    }
    return profile;
  }

  async getByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<FacultyProfile | null> {
    return this.repository.findByEmployee(tenantId, employeeId);
  }

  async list(tenantId: TenantId): Promise<FacultyProfile[]> {
    return this.repository.listByTenant(tenantId);
  }

  /**
   * A leadership-facing descriptive rollup of an organization's faculty growth — headcount,
   * growth-band distribution and the counts distinguished / needing support — computed by the pure
   * {@link summarizeFaculty} engine over the organization's profiles.
   */
  async summarizeOrganization(tenantId: TenantId, organizationId: Uuid): Promise<FacultySummary> {
    const profiles = await this.repository.listByOrganization(tenantId, organizationId);
    const members: FacultyMemberView[] = profiles.map((p) => ({ growthBand: p.growthBand }));
    return summarizeFaculty(members);
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
