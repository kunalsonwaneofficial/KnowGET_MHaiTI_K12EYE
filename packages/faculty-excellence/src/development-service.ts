import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { computeDevelopmentLedger } from "./development-ledger";
import {
  type DevelopmentRequirement,
  type SetRequirementParams,
  setRequiredHours,
  setRequirement,
} from "./development-requirement";
import {
  ActivityNotFoundError,
  DevelopmentRequirementNotFoundError,
  DuplicateRequirementError,
  EmployeeNotFoundForFacultyError,
} from "./errors";
import { activityCompleted, activityPlanned } from "./faculty-events";
import type { DevelopmentLedger } from "./faculty-view";
import {
  cancelActivity,
  completeActivity,
  enrollActivity,
  type PlanActivityParams,
  planActivity,
  type ProfessionalLearningActivity,
  setActivityHours,
} from "./professional-learning-activity";
import type {
  DevelopmentRequirementRepository,
  EmployeeDirectory,
  ProfessionalLearningActivityRepository,
} from "./ports";

/** The service requirement input — the organization is derived from the employee, not supplied. */
export type SetRequirementInput = Omit<SetRequirementParams, "organizationId">;
/** The service activity input — the organization is derived from the employee, not supplied. */
export type PlanActivityInput = Omit<PlanActivityParams, "organizationId">;

export interface DevelopmentServiceDeps {
  readonly requirements: DevelopmentRequirementRepository;
  readonly activities: ProfessionalLearningActivityRepository;
  readonly employees: EmployeeDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for professional development — the requirement/activity pair that feeds the
 * pure development-ledger engine. Sets CPD requirements (one per category per period), records and
 * runs the lifecycle of PD activities (`planned → enrolled → completed | cancelled`), and reconciles
 * the two into a per-category compliance ledger via {@link computeDevelopmentLedger}. Publishes the
 * activity events.
 */
export class DevelopmentService {
  private readonly requirements: DevelopmentRequirementRepository;
  private readonly activities: ProfessionalLearningActivityRepository;
  private readonly employees: EmployeeDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: DevelopmentServiceDeps) {
    this.requirements = deps.requirements;
    this.activities = deps.activities;
    this.employees = deps.employees;
    this.events = deps.events;
  }

  async setRequirement(input: SetRequirementInput): Promise<DevelopmentRequirement> {
    const organizationId = await this.requireEmployeeOrganization(input.tenantId, input.employeeId);
    const existing = await this.requirements.findByScope(
      input.tenantId,
      input.employeeId,
      input.category,
      input.period,
    );
    if (existing) {
      throw new DuplicateRequirementError(input.category, input.period);
    }
    const requirement = setRequirement({ ...input, organizationId });
    await this.requirements.save(requirement);
    return requirement;
  }

  async reviseRequirement(
    tenantId: TenantId,
    id: Uuid,
    requiredHours: number,
  ): Promise<DevelopmentRequirement> {
    const requirement = await this.requirements.findById(tenantId, id);
    if (!requirement) {
      throw new DevelopmentRequirementNotFoundError(id);
    }
    const updated = setRequiredHours(requirement, requiredHours);
    await this.requirements.save(updated);
    return updated;
  }

  async plan(input: PlanActivityInput): Promise<ProfessionalLearningActivity> {
    const organizationId = await this.requireEmployeeOrganization(input.tenantId, input.employeeId);
    const activity = planActivity({ ...input, organizationId });
    await this.activities.save(activity);
    await this.emit(activityPlanned(activity));
    return activity;
  }

  async enroll(tenantId: TenantId, id: Uuid): Promise<ProfessionalLearningActivity> {
    return this.mutateActivity(tenantId, id, enrollActivity);
  }

  async complete(
    tenantId: TenantId,
    id: Uuid,
    completedOn?: string | null,
  ): Promise<ProfessionalLearningActivity> {
    const updated = completeActivity(await this.requireActivity(tenantId, id), completedOn);
    await this.activities.save(updated);
    await this.emit(activityCompleted(updated));
    return updated;
  }

  async cancel(tenantId: TenantId, id: Uuid): Promise<ProfessionalLearningActivity> {
    return this.mutateActivity(tenantId, id, cancelActivity);
  }

  async setActivityHours(
    tenantId: TenantId,
    id: Uuid,
    hours: number,
  ): Promise<ProfessionalLearningActivity> {
    return this.mutateActivity(tenantId, id, (a) => setActivityHours(a, hours));
  }

  /**
   * Reconcile the employee's requirements and activities for a period into a per-category compliance
   * ledger — the genuine read model of CPD, computed by the pure engine over narrow views.
   */
  async computeLedger(
    tenantId: TenantId,
    employeeId: Uuid,
    period: string,
  ): Promise<DevelopmentLedger> {
    const [requirements, activities] = await Promise.all([
      this.requirements.listByEmployee(tenantId, employeeId),
      this.activities.listByEmployee(tenantId, employeeId),
    ]);
    return computeDevelopmentLedger(
      requirements
        .filter((r) => r.period === period)
        .map((r) => ({ category: r.category, requiredHours: r.requiredHours })),
      activities
        .filter((a) => a.period === period)
        .map((a) => ({ category: a.category, hours: a.hours, status: a.status })),
    );
  }

  async getActivity(tenantId: TenantId, id: Uuid): Promise<ProfessionalLearningActivity> {
    return this.requireActivity(tenantId, id);
  }

  async listActivities(
    tenantId: TenantId,
    employeeId: Uuid,
  ): Promise<ProfessionalLearningActivity[]> {
    return this.activities.listByEmployee(tenantId, employeeId);
  }

  async listRequirements(tenantId: TenantId, employeeId: Uuid): Promise<DevelopmentRequirement[]> {
    return this.requirements.listByEmployee(tenantId, employeeId);
  }

  private async mutateActivity(
    tenantId: TenantId,
    id: Uuid,
    fn: (activity: ProfessionalLearningActivity) => ProfessionalLearningActivity,
  ): Promise<ProfessionalLearningActivity> {
    const updated = fn(await this.requireActivity(tenantId, id));
    await this.activities.save(updated);
    return updated;
  }

  private async requireActivity(
    tenantId: TenantId,
    id: Uuid,
  ): Promise<ProfessionalLearningActivity> {
    const activity = await this.activities.findById(tenantId, id);
    if (!activity) {
      throw new ActivityNotFoundError(id);
    }
    return activity;
  }

  private async requireEmployeeOrganization(tenantId: TenantId, employeeId: Uuid): Promise<Uuid> {
    const organizationId = await this.employees.organizationOf(tenantId, employeeId);
    if (organizationId === null) {
      throw new EmployeeNotFoundForFacultyError(employeeId);
    }
    return organizationId;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
