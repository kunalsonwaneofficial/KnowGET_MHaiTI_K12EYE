import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  acceptEngagement,
  cancelEngagement,
  type CoachingEngagement,
  completeEngagement,
  isEngagementRunning,
  type ProposeEngagementParams,
  proposeEngagement,
  setEngagementFocus,
} from "./coaching-engagement";
import {
  CoachingEngagementNotFoundError,
  DuplicateActiveEngagementError,
  EmployeeNotFoundForFacultyError,
  OrganizationNotFoundForFacultyError,
} from "./errors";
import { engagementAccepted, engagementCompleted, engagementProposed } from "./faculty-events";
import type {
  CoachingEngagementRepository,
  EmployeeDirectory,
  OrganizationDirectory,
} from "./ports";

export interface CoachingEngagementServiceDeps {
  readonly repository: CoachingEngagementRepository;
  readonly employees: EmployeeDirectory;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for coaching engagements — the coach↔coachee development relationship. Proposes
 * an engagement (validating the organization and both employees, and that the coach differs from the
 * coachee), and drives the `proposed → active → completed | cancelled` lifecycle — enforcing at most
 * one active engagement per coachee. Publishes the engagement events.
 */
export class CoachingEngagementService {
  private readonly repository: CoachingEngagementRepository;
  private readonly employees: EmployeeDirectory;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: CoachingEngagementServiceDeps) {
    this.repository = deps.repository;
    this.employees = deps.employees;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async propose(input: ProposeEngagementParams): Promise<CoachingEngagement> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForFacultyError(input.organizationId);
    }
    await this.assertEmployeeExists(input.tenantId, input.coachId);
    await this.assertEmployeeExists(input.tenantId, input.coacheeId);
    const engagement = proposeEngagement(input);
    await this.repository.save(engagement);
    await this.emit(engagementProposed(engagement));
    return engagement;
  }

  async accept(tenantId: TenantId, id: Uuid): Promise<CoachingEngagement> {
    const engagement = await this.require(tenantId, id);
    await this.assertNoActiveEngagement(tenantId, engagement.coacheeId, engagement.id);
    const updated = acceptEngagement(engagement);
    await this.repository.save(updated);
    await this.emit(engagementAccepted(updated));
    return updated;
  }

  async complete(
    tenantId: TenantId,
    id: Uuid,
    endDate?: string | null,
  ): Promise<CoachingEngagement> {
    const updated = completeEngagement(await this.require(tenantId, id), endDate);
    await this.repository.save(updated);
    await this.emit(engagementCompleted(updated));
    return updated;
  }

  async cancel(tenantId: TenantId, id: Uuid, endDate?: string | null): Promise<CoachingEngagement> {
    const updated = cancelEngagement(await this.require(tenantId, id), endDate);
    await this.repository.save(updated);
    return updated;
  }

  async setFocus(tenantId: TenantId, id: Uuid, focus: string): Promise<CoachingEngagement> {
    const updated = setEngagementFocus(await this.require(tenantId, id), focus);
    await this.repository.save(updated);
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<CoachingEngagement> {
    return this.require(tenantId, id);
  }

  async listForCoachee(tenantId: TenantId, coacheeId: Uuid): Promise<CoachingEngagement[]> {
    return this.repository.listByCoachee(tenantId, coacheeId);
  }

  async listForCoach(tenantId: TenantId, coachId: Uuid): Promise<CoachingEngagement[]> {
    return this.repository.listByCoach(tenantId, coachId);
  }

  async listForOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<CoachingEngagement[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  async list(tenantId: TenantId): Promise<CoachingEngagement[]> {
    return this.repository.listByTenant(tenantId);
  }

  private async assertEmployeeExists(tenantId: TenantId, employeeId: Uuid): Promise<void> {
    if (!(await this.employees.exists(tenantId, employeeId))) {
      throw new EmployeeNotFoundForFacultyError(employeeId);
    }
  }

  private async assertNoActiveEngagement(
    tenantId: TenantId,
    coacheeId: Uuid,
    exceptId: Uuid,
  ): Promise<void> {
    const existing = await this.repository.listByCoachee(tenantId, coacheeId);
    if (existing.some((e) => e.id !== exceptId && isEngagementRunning(e))) {
      throw new DuplicateActiveEngagementError(coacheeId);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<CoachingEngagement> {
    const engagement = await this.repository.findById(tenantId, id);
    if (!engagement) {
      throw new CoachingEngagementNotFoundError(id);
    }
    return engagement;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
