import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  abandonGoal,
  achieveGoal,
  activateGoal,
  type DevelopmentGoal,
  type DraftGoalParams,
  draftGoal,
  setGoalDescription,
  setGoalTargetDate,
} from "./development-goal";
import { DevelopmentGoalNotFoundError, EmployeeNotFoundForFacultyError } from "./errors";
import { goalAchieved, goalActivated } from "./faculty-events";
import type { DevelopmentGoalRepository, EmployeeDirectory } from "./ports";

/** The service draft input — the organization is derived from the employee, not supplied. */
export type DraftGoalInput = Omit<DraftGoalParams, "organizationId">;

export interface DevelopmentGoalServiceDeps {
  readonly repository: DevelopmentGoalRepository;
  readonly employees: EmployeeDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for development goals — a staff member's professional-growth objectives.
 * Drafts a goal against an employee (deriving the organization), and drives the `draft → active →
 * achieved | abandoned` lifecycle, publishing the goal activated/achieved events. Goal progress
 * feeds the descriptive faculty-growth profile.
 */
export class DevelopmentGoalService {
  private readonly repository: DevelopmentGoalRepository;
  private readonly employees: EmployeeDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: DevelopmentGoalServiceDeps) {
    this.repository = deps.repository;
    this.employees = deps.employees;
    this.events = deps.events;
  }

  async draft(input: DraftGoalInput): Promise<DevelopmentGoal> {
    const organizationId = await this.employees.organizationOf(input.tenantId, input.employeeId);
    if (organizationId === null) {
      throw new EmployeeNotFoundForFacultyError(input.employeeId);
    }
    const goal = draftGoal({ ...input, organizationId });
    await this.repository.save(goal);
    return goal;
  }

  async setDescription(
    tenantId: TenantId,
    id: Uuid,
    description: string,
  ): Promise<DevelopmentGoal> {
    return this.mutate(tenantId, id, (g) => setGoalDescription(g, description));
  }

  async setTargetDate(
    tenantId: TenantId,
    id: Uuid,
    targetDate: string | null,
  ): Promise<DevelopmentGoal> {
    return this.mutate(tenantId, id, (g) => setGoalTargetDate(g, targetDate));
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<DevelopmentGoal> {
    const updated = activateGoal(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(goalActivated(updated));
    return updated;
  }

  async achieve(tenantId: TenantId, id: Uuid, outcome?: string | null): Promise<DevelopmentGoal> {
    const updated = achieveGoal(await this.require(tenantId, id), outcome);
    await this.repository.save(updated);
    await this.emit(goalAchieved(updated));
    return updated;
  }

  async abandon(tenantId: TenantId, id: Uuid, outcome?: string | null): Promise<DevelopmentGoal> {
    const updated = abandonGoal(await this.require(tenantId, id), outcome);
    await this.repository.save(updated);
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<DevelopmentGoal> {
    return this.require(tenantId, id);
  }

  async listForEmployee(tenantId: TenantId, employeeId: Uuid): Promise<DevelopmentGoal[]> {
    return this.repository.listByEmployee(tenantId, employeeId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (goal: DevelopmentGoal) => DevelopmentGoal,
  ): Promise<DevelopmentGoal> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<DevelopmentGoal> {
    const goal = await this.repository.findById(tenantId, id);
    if (!goal) {
      throw new DevelopmentGoalNotFoundError(id);
    }
    return goal;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
