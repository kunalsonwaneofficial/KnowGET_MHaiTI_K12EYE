import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  OrganizationNotFoundForGovernanceError,
  ParentGovernanceBodyNotFoundError,
  PersonNotFoundForGovernanceError,
  ResolutionNotFoundError,
} from "./errors";
import { resolutionApproved, resolutionImplemented } from "./governance-events";
import type {
  GovernanceBodyRepository,
  OrganizationDirectory,
  PersonDirectory,
  ResolutionRepository,
} from "./ports";
import {
  type CastVoteParams,
  castVote,
  type DraftResolutionParams,
  draftResolution,
  markImplemented,
  openVoting,
  type Resolution,
  tallyResolution,
} from "./resolution";

export interface ResolutionServiceDeps {
  readonly repository: ResolutionRepository;
  readonly organizations: OrganizationDirectory;
  readonly persons: PersonDirectory;
  readonly governanceBodies: GovernanceBodyRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for resolutions. Drafts formal decisions of a governance body,
 * runs the voting lifecycle (open → cast votes → tally to approval/rejection by
 * majority), and tracks implementation — publishing `governance.resolution.approved`
 * / `.implemented` for the institutional decision record.
 */
export class ResolutionService {
  private readonly repository: ResolutionRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly persons: PersonDirectory;
  private readonly governanceBodies: GovernanceBodyRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ResolutionServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.persons = deps.persons;
    this.governanceBodies = deps.governanceBodies;
    this.events = deps.events;
  }

  async draft(input: DraftResolutionParams): Promise<Resolution> {
    await this.assertOrganizationExists(input.tenantId, input.organizationId);
    await this.assertGovernanceBodyExists(input.tenantId, input.governanceBodyId);
    await this.assertPersonExists(input.tenantId, input.proposedById);
    const resolution = draftResolution(input);
    await this.repository.save(resolution);
    return resolution;
  }

  async openVoting(tenantId: TenantId, id: Uuid): Promise<Resolution> {
    const updated = openVoting(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  async vote(tenantId: TenantId, id: Uuid, params: CastVoteParams): Promise<Resolution> {
    await this.assertPersonExists(tenantId, params.voterId);
    const updated = castVote(await this.require(tenantId, id), params);
    await this.repository.save(updated);
    return updated;
  }

  async tally(
    tenantId: TenantId,
    id: Uuid,
    options?: { effectiveOn?: string | null; decidedOn?: string | null },
  ): Promise<Resolution> {
    const updated = tallyResolution(await this.require(tenantId, id), options);
    await this.repository.save(updated);
    if (updated.status === "approved") {
      await this.emit(resolutionApproved(updated));
    }
    return updated;
  }

  async implement(
    tenantId: TenantId,
    id: Uuid,
    implementedOn?: string | null,
  ): Promise<Resolution> {
    const updated = markImplemented(await this.require(tenantId, id), implementedOn);
    await this.repository.save(updated);
    await this.emit(resolutionImplemented(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Resolution> {
    return this.require(tenantId, id);
  }

  async list(tenantId: TenantId): Promise<Resolution[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForGovernanceBody(tenantId: TenantId, governanceBodyId: Uuid): Promise<Resolution[]> {
    return this.repository.listByGovernanceBody(tenantId, governanceBodyId);
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

  private async assertPersonExists(tenantId: TenantId, personId: Uuid): Promise<void> {
    if (!(await this.persons.exists(tenantId, personId))) {
      throw new PersonNotFoundForGovernanceError(personId);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Resolution> {
    const resolution = await this.repository.findById(tenantId, id);
    if (!resolution) {
      throw new ResolutionNotFoundError(id);
    }
    return resolution;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
