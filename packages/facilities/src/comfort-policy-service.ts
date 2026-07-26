import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  activateComfortPolicy,
  archiveComfortPolicy,
  type ComfortPolicy,
  type DraftComfortPolicyParams,
  draftComfortPolicy,
  renameComfortPolicy,
  setComfortThresholds,
} from "./comfort-policy";
import {
  ComfortPolicyNotFoundError,
  DuplicateActiveComfortPolicyError,
  OrganizationNotFoundForFacilitiesError,
} from "./errors";
import {
  comfortPolicyActivated,
  comfortPolicyArchived,
  comfortPolicyDrafted,
  comfortPolicyUpdated,
} from "./facilities-events";
import type { ComfortThreshold } from "./facilities-view";
import type { ComfortPolicyRepository, OrganizationDirectory } from "./ports";

export interface ComfortPolicyServiceDeps {
  readonly repository: ComfortPolicyRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for comfort policies — the versioned per-metric ranges the comfort engine measures a
 * space against. Drafts a policy (validating the organization), edits its thresholds and name while draft,
 * activates it (enforcing at most one active policy per organization — TD-40), and archives it, publishing
 * the policy events.
 */
export class ComfortPolicyService {
  private readonly repository: ComfortPolicyRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ComfortPolicyServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async draft(input: DraftComfortPolicyParams): Promise<ComfortPolicy> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForFacilitiesError(input.organizationId);
    }
    const policy = draftComfortPolicy(input);
    await this.repository.save(policy);
    await this.emit(comfortPolicyDrafted(policy));
    return policy;
  }

  async setThresholds(
    tenantId: TenantId,
    id: Uuid,
    thresholds: readonly ComfortThreshold[],
  ): Promise<ComfortPolicy> {
    const updated = setComfortThresholds(await this.require(tenantId, id), thresholds);
    await this.repository.save(updated);
    await this.emit(comfortPolicyUpdated(updated));
    return updated;
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<ComfortPolicy> {
    const updated = renameComfortPolicy(await this.require(tenantId, id), name);
    await this.repository.save(updated);
    await this.emit(comfortPolicyUpdated(updated));
    return updated;
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<ComfortPolicy> {
    const policy = await this.require(tenantId, id);
    const active = await this.repository.findActiveByOrganization(tenantId, policy.organizationId);
    if (active && active.id !== policy.id) {
      throw new DuplicateActiveComfortPolicyError(policy.organizationId);
    }
    const updated = activateComfortPolicy(policy);
    await this.repository.save(updated);
    await this.emit(comfortPolicyActivated(updated));
    return updated;
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<ComfortPolicy> {
    const updated = archiveComfortPolicy(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(comfortPolicyArchived(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<ComfortPolicy> {
    return this.require(tenantId, id);
  }

  async getActiveForOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<ComfortPolicy | null> {
    return this.repository.findActiveByOrganization(tenantId, organizationId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<ComfortPolicy[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<ComfortPolicy> {
    const policy = await this.repository.findById(tenantId, id);
    if (!policy) {
      throw new ComfortPolicyNotFoundError(id);
    }
    return policy;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
