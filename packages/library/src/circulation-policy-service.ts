import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  activatePolicy,
  archivePolicy,
  type CategoryRule,
  type CirculationPolicy,
  type DefaultRule,
  type DraftPolicyParams,
  draftCirculationPolicy,
  resolveTerms,
  setPolicyDefaultRule,
  setPolicyRules,
} from "./circulation-policy";
import {
  OrganizationNotFoundForLibraryError,
  OrgHasActivePolicyError,
  PolicyNotFoundError,
} from "./errors";
import type { CirculationPolicyRepository, OrganizationDirectory } from "./ports";
import { policyActivated, policyArchived, policyDrafted } from "./library-events";
import type { MemberCategory } from "./library-value";

export interface CirculationPolicyServiceDeps {
  readonly repository: CirculationPolicyRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for circulation policies. Drafts a policy (validating the organization), edits its
 * rules while draft, activates it (enforcing one active policy per organization), archives it, and
 * resolves the loan terms for a member category from the active policy. Publishes the policy events.
 */
export class CirculationPolicyService {
  private readonly repository: CirculationPolicyRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: CirculationPolicyServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async draft(input: DraftPolicyParams): Promise<CirculationPolicy> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForLibraryError(input.organizationId);
    }
    const policy = draftCirculationPolicy(input);
    await this.repository.save(policy);
    await this.emit(policyDrafted(policy));
    return policy;
  }

  async setRules(
    tenantId: TenantId,
    id: Uuid,
    rules: readonly CategoryRule[],
  ): Promise<CirculationPolicy> {
    return this.mutate(tenantId, id, (p) => setPolicyRules(p, rules));
  }

  async setDefaultRule(
    tenantId: TenantId,
    id: Uuid,
    defaultRule: DefaultRule,
  ): Promise<CirculationPolicy> {
    return this.mutate(tenantId, id, (p) => setPolicyDefaultRule(p, defaultRule));
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<CirculationPolicy> {
    const policy = await this.require(tenantId, id);
    const active = await this.repository.findActiveByOrganization(tenantId, policy.organizationId);
    if (active && active.id !== id) {
      throw new OrgHasActivePolicyError(policy.organizationId);
    }
    const updated = activatePolicy(policy);
    await this.repository.save(updated);
    await this.emit(policyActivated(updated));
    return updated;
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<CirculationPolicy> {
    const updated = archivePolicy(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(policyArchived(updated));
    return updated;
  }

  /** Resolve the circulation terms for a member category from the org's active policy. */
  async resolveTermsForMember(
    tenantId: TenantId,
    organizationId: Uuid,
    category: MemberCategory,
  ): Promise<DefaultRule> {
    const policy = await this.repository.findActiveByOrganization(tenantId, organizationId);
    if (!policy) {
      throw new PolicyNotFoundError(`active policy for organization "${organizationId}"`);
    }
    return resolveTerms(policy, category);
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<CirculationPolicy> {
    return this.require(tenantId, id);
  }

  async getActiveForOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<CirculationPolicy | null> {
    return this.repository.findActiveByOrganization(tenantId, organizationId);
  }

  async listForOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<CirculationPolicy[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (policy: CirculationPolicy) => CirculationPolicy,
  ): Promise<CirculationPolicy> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<CirculationPolicy> {
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
