import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  OrganizationNotFoundForGovernanceError,
  PersonNotFoundForGovernanceError,
  PolicyNotFoundError,
  PolicyNotPublishedError,
} from "./errors";
import { policyPublished, policyRetired } from "./governance-events";
import {
  acknowledge,
  amendPolicy,
  approvePolicy,
  type AuthorPolicyParams,
  authorPolicy,
  isInForce,
  type Policy,
  type PolicyAcknowledgment,
  publishPolicy,
  retirePolicy,
  updateDraft,
} from "./policy";
import type {
  OrganizationDirectory,
  PersonDirectory,
  PolicyAcknowledgmentRepository,
  PolicyRepository,
} from "./ports";

export interface PolicyServiceDeps {
  readonly repository: PolicyRepository;
  readonly acknowledgments: PolicyAcknowledgmentRepository;
  readonly organizations: OrganizationDirectory;
  readonly persons: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for the policy registry. Authors and versions policies,
 * drives the lifecycle (draft → approved → published → retired, with amendment
 * bumping the version), records acknowledgments, and answers "which policies apply"
 * to an organization — publishing `governance.policy.published` / `.retired`.
 */
export class PolicyService {
  private readonly repository: PolicyRepository;
  private readonly acknowledgments: PolicyAcknowledgmentRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly persons: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: PolicyServiceDeps) {
    this.repository = deps.repository;
    this.acknowledgments = deps.acknowledgments;
    this.organizations = deps.organizations;
    this.persons = deps.persons;
    this.events = deps.events;
  }

  async author(input: AuthorPolicyParams): Promise<Policy> {
    await this.assertOrganizationExists(input.tenantId, input.organizationId);
    await this.assertPersonExists(input.tenantId, input.ownerId);
    const policy = authorPolicy(input);
    await this.repository.save(policy);
    return policy;
  }

  async editDraft(
    tenantId: TenantId,
    id: Uuid,
    changes: { title?: string; body?: string },
  ): Promise<Policy> {
    const updated = updateDraft(await this.require(tenantId, id), changes);
    await this.repository.save(updated);
    return updated;
  }

  async approve(tenantId: TenantId, id: Uuid, approvedOn?: string | null): Promise<Policy> {
    const updated = approvePolicy(await this.require(tenantId, id), approvedOn);
    await this.repository.save(updated);
    return updated;
  }

  async publish(
    tenantId: TenantId,
    id: Uuid,
    options?: { effectiveOn?: string | null; publishedOn?: string | null },
  ): Promise<Policy> {
    const updated = publishPolicy(await this.require(tenantId, id), options);
    await this.repository.save(updated);
    await this.emit(policyPublished(updated));
    return updated;
  }

  async amend(tenantId: TenantId, id: Uuid): Promise<Policy> {
    const updated = amendPolicy(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  async retire(tenantId: TenantId, id: Uuid, retiredOn?: string | null): Promise<Policy> {
    const updated = retirePolicy(await this.require(tenantId, id), retiredOn);
    await this.repository.save(updated);
    await this.emit(policyRetired(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Policy> {
    return this.require(tenantId, id);
  }

  async list(tenantId: TenantId): Promise<Policy[]> {
    return this.repository.listByTenant(tenantId);
  }

  /** The published (in-force) policies applicable to an organization node. */
  async listApplicable(tenantId: TenantId, organizationId: Uuid): Promise<Policy[]> {
    await this.assertOrganizationExists(tenantId, organizationId);
    return this.repository.listPublishedByOrganization(tenantId, organizationId);
  }

  async acknowledgePolicy(
    tenantId: TenantId,
    id: Uuid,
    personId: Uuid,
  ): Promise<PolicyAcknowledgment> {
    const policy = await this.require(tenantId, id);
    if (!isInForce(policy)) {
      throw new PolicyNotPublishedError(id);
    }
    await this.assertPersonExists(tenantId, personId);
    const acknowledgment = acknowledge(policy, personId);
    await this.acknowledgments.save(acknowledgment);
    return acknowledgment;
  }

  async listAcknowledgments(tenantId: TenantId, id: Uuid): Promise<PolicyAcknowledgment[]> {
    await this.require(tenantId, id);
    return this.acknowledgments.listByPolicy(tenantId, id);
  }

  private async assertOrganizationExists(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForGovernanceError(organizationId);
    }
  }

  private async assertPersonExists(tenantId: TenantId, personId: Uuid): Promise<void> {
    if (!(await this.persons.exists(tenantId, personId))) {
      throw new PersonNotFoundForGovernanceError(personId);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Policy> {
    const policy = await this.repository.findById(tenantId, id);
    if (!policy) {
      throw new PolicyNotFoundError(id);
    }
    return policy;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
