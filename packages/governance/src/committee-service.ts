import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  type AppointMemberParams,
  appointMember,
  changeMemberRole,
  type Committee,
  type CommitteeRole,
  type CreateCommitteeParams,
  createCommittee,
  dissolveCommittee,
  removeMember,
  reviseCommitteeTerms,
} from "./committee";
import {
  CommitteeNotFoundError,
  OrganizationNotFoundForGovernanceError,
  ParentGovernanceBodyNotFoundError,
  PersonNotFoundForGovernanceError,
} from "./errors";
import { committeeCreated } from "./governance-events";
import type {
  CommitteeRepository,
  GovernanceBodyRepository,
  OrganizationDirectory,
  PersonDirectory,
} from "./ports";

export interface CommitteeServiceDeps {
  readonly repository: CommitteeRepository;
  readonly organizations: OrganizationDirectory;
  readonly persons: PersonDirectory;
  readonly governanceBodies: GovernanceBodyRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for committees. Constitutes committees (validating the
 * organization and any reporting governance body), manages their composition
 * (members with a single chair/secretary, each a Person in the tenant), and drives
 * the lifecycle — publishing `governance.committee.created`. Transport-agnostic.
 */
export class CommitteeService {
  private readonly repository: CommitteeRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly persons: PersonDirectory;
  private readonly governanceBodies: GovernanceBodyRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: CommitteeServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.persons = deps.persons;
    this.governanceBodies = deps.governanceBodies;
    this.events = deps.events;
  }

  async form(input: CreateCommitteeParams): Promise<Committee> {
    await this.assertOrganizationExists(input.tenantId, input.organizationId);
    if (input.governanceBodyId) {
      await this.assertGovernanceBodyExists(input.tenantId, input.governanceBodyId);
    }
    const committee = createCommittee(input);
    await this.repository.save(committee);
    await this.emit(committeeCreated(committee));
    return committee;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Committee> {
    return this.require(tenantId, id);
  }

  async list(tenantId: TenantId): Promise<Committee[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Committee[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  async appoint(tenantId: TenantId, id: Uuid, params: AppointMemberParams): Promise<Committee> {
    await this.assertPersonExists(tenantId, params.personId);
    const updated = appointMember(await this.require(tenantId, id), params);
    await this.repository.save(updated);
    return updated;
  }

  async removeMember(tenantId: TenantId, id: Uuid, personId: Uuid): Promise<Committee> {
    const updated = removeMember(await this.require(tenantId, id), personId);
    await this.repository.save(updated);
    return updated;
  }

  async changeRole(
    tenantId: TenantId,
    id: Uuid,
    personId: Uuid,
    role: CommitteeRole,
  ): Promise<Committee> {
    const updated = changeMemberRole(await this.require(tenantId, id), personId, role);
    await this.repository.save(updated);
    return updated;
  }

  async reviseTerms(
    tenantId: TenantId,
    id: Uuid,
    termsOfReference: string | null,
  ): Promise<Committee> {
    const updated = reviseCommitteeTerms(await this.require(tenantId, id), termsOfReference);
    await this.repository.save(updated);
    return updated;
  }

  async dissolve(tenantId: TenantId, id: Uuid): Promise<Committee> {
    const updated = dissolveCommittee(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
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

  private async require(tenantId: TenantId, id: Uuid): Promise<Committee> {
    const committee = await this.repository.findById(tenantId, id);
    if (!committee) {
      throw new CommitteeNotFoundError(id);
    }
    return committee;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
