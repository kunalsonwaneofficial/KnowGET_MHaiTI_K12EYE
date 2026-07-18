import type { TenantId, Uuid } from "@knowget/types";
import {
  CommitteeNotFoundForGovernanceError,
  GovernanceCalendarEntryNotFoundError,
  OrganizationNotFoundForGovernanceError,
  ParentGovernanceBodyNotFoundError,
  PersonNotFoundForGovernanceError,
} from "./errors";
import {
  cancelEntry,
  type CompleteEntryParams,
  completeEntry,
  type GovernanceCalendarEntry,
  rescheduleEntry,
  type ScheduleEntryParams,
  scheduleEntry,
} from "./governance-calendar";
import type {
  CommitteeRepository,
  GovernanceBodyRepository,
  GovernanceCalendarRepository,
  OrganizationDirectory,
  PersonDirectory,
} from "./ports";

export interface GovernanceCalendarServiceDeps {
  readonly repository: GovernanceCalendarRepository;
  readonly organizations: OrganizationDirectory;
  readonly governanceBodies: GovernanceBodyRepository;
  readonly committees: CommitteeRepository;
  readonly persons: PersonDirectory;
}

/** A date-only ISO string (YYYY-MM-DD) for overdue/upcoming checks. */
const today = (): string => new Date().toISOString().slice(0, 10);

const byDate = (a: GovernanceCalendarEntry, b: GovernanceCalendarEntry): number =>
  a.scheduledOn < b.scheduledOn ? -1 : a.scheduledOn > b.scheduledOn ? 1 : 0;

/**
 * Application service for the governance calendar. Schedules and tracks meetings,
 * compliance deadlines, board activities, regulatory events and reviews (validating
 * the organization and any referenced body/committee), records meeting minutes and
 * attendance on completion, and answers the upcoming/history queries.
 */
export class GovernanceCalendarService {
  private readonly repository: GovernanceCalendarRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly governanceBodies: GovernanceBodyRepository;
  private readonly committees: CommitteeRepository;
  private readonly persons: PersonDirectory;

  constructor(deps: GovernanceCalendarServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.governanceBodies = deps.governanceBodies;
    this.committees = deps.committees;
    this.persons = deps.persons;
  }

  async schedule(input: ScheduleEntryParams): Promise<GovernanceCalendarEntry> {
    await this.assertOrganizationExists(input.tenantId, input.organizationId);
    if (input.governanceBodyId) {
      await this.assertGovernanceBodyExists(input.tenantId, input.governanceBodyId);
    }
    if (input.committeeId) {
      await this.assertCommitteeExists(input.tenantId, input.committeeId);
    }
    const entry = scheduleEntry(input);
    await this.repository.save(entry);
    return entry;
  }

  async reschedule(
    tenantId: TenantId,
    id: Uuid,
    scheduledOn: string,
  ): Promise<GovernanceCalendarEntry> {
    const updated = rescheduleEntry(await this.require(tenantId, id), scheduledOn);
    await this.repository.save(updated);
    return updated;
  }

  async complete(
    tenantId: TenantId,
    id: Uuid,
    params?: CompleteEntryParams,
  ): Promise<GovernanceCalendarEntry> {
    const entry = await this.require(tenantId, id);
    for (const personId of params?.attendeeIds ?? []) {
      await this.assertPersonExists(tenantId, personId);
    }
    const updated = completeEntry(entry, params);
    await this.repository.save(updated);
    return updated;
  }

  async cancel(tenantId: TenantId, id: Uuid): Promise<GovernanceCalendarEntry> {
    const updated = cancelEntry(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<GovernanceCalendarEntry> {
    return this.require(tenantId, id);
  }

  async list(tenantId: TenantId): Promise<GovernanceCalendarEntry[]> {
    return [...(await this.repository.listByTenant(tenantId))].sort(byDate);
  }

  async listForOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<GovernanceCalendarEntry[]> {
    return [...(await this.repository.listByOrganization(tenantId, organizationId))].sort(byDate);
  }

  /** Scheduled entries on or after `from` (default today), earliest first. */
  async upcoming(tenantId: TenantId, from: string = today()): Promise<GovernanceCalendarEntry[]> {
    return (await this.list(tenantId)).filter(
      (e) => e.status === "scheduled" && e.scheduledOn >= from,
    );
  }

  private async assertOrganizationExists(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForGovernanceError(organizationId);
    }
  }

  private async assertGovernanceBodyExists(tenantId: TenantId, bodyId: Uuid): Promise<void> {
    if (!(await this.governanceBodies.findById(tenantId, bodyId))) {
      throw new ParentGovernanceBodyNotFoundError(bodyId);
    }
  }

  private async assertCommitteeExists(tenantId: TenantId, committeeId: Uuid): Promise<void> {
    if (!(await this.committees.findById(tenantId, committeeId))) {
      throw new CommitteeNotFoundForGovernanceError(committeeId);
    }
  }

  private async assertPersonExists(tenantId: TenantId, personId: Uuid): Promise<void> {
    if (!(await this.persons.exists(tenantId, personId))) {
      throw new PersonNotFoundForGovernanceError(personId);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<GovernanceCalendarEntry> {
    const entry = await this.repository.findById(tenantId, id);
    if (!entry) {
      throw new GovernanceCalendarEntryNotFoundError(id);
    }
    return entry;
  }
}
