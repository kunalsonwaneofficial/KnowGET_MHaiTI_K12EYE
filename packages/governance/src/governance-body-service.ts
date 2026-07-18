import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  GovernanceBodyNotFoundError,
  OrganizationNotFoundForGovernanceError,
  ParentGovernanceBodyNotFoundError,
} from "./errors";
import {
  type CreateGovernanceBodyParams,
  createGovernanceBody,
  dissolveGovernanceBody,
  type GovernanceBody,
  renameGovernanceBody,
  reviseTermsOfReference,
} from "./governance-body";
import { governanceBodyCreated, governanceBodyDissolved } from "./governance-events";
import type { GovernanceBodyRepository, OrganizationDirectory } from "./ports";

export interface GovernanceBodyServiceDeps {
  readonly repository: GovernanceBodyRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for governance bodies. Establishes bodies (validating the
 * governed organization and any parent body exist in the tenant), maintains the
 * governance hierarchy, and drives the lifecycle — publishing a domain event per
 * change. Persistence- and transport-agnostic.
 */
export class GovernanceBodyService {
  private readonly repository: GovernanceBodyRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: GovernanceBodyServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async establish(input: CreateGovernanceBodyParams): Promise<GovernanceBody> {
    await this.assertOrganizationExists(input.tenantId, input.organizationId);
    if (input.parentBodyId) {
      await this.assertParentExists(input.tenantId, input.parentBodyId);
    }
    const body = createGovernanceBody(input);
    await this.repository.save(body);
    await this.emit(governanceBodyCreated(body));
    return body;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<GovernanceBody> {
    return this.require(tenantId, id);
  }

  async list(tenantId: TenantId): Promise<GovernanceBody[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<GovernanceBody[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  /** The direct child bodies of a governance body (one level of the hierarchy). */
  async children(tenantId: TenantId, parentBodyId: Uuid): Promise<GovernanceBody[]> {
    await this.require(tenantId, parentBodyId);
    return this.repository.findChildren(tenantId, parentBodyId);
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<GovernanceBody> {
    const updated = renameGovernanceBody(await this.require(tenantId, id), name);
    await this.repository.save(updated);
    return updated;
  }

  async reviseTerms(
    tenantId: TenantId,
    id: Uuid,
    termsOfReference: string | null,
  ): Promise<GovernanceBody> {
    const updated = reviseTermsOfReference(await this.require(tenantId, id), termsOfReference);
    await this.repository.save(updated);
    return updated;
  }

  async dissolve(
    tenantId: TenantId,
    id: Uuid,
    dissolvedOn?: string | null,
  ): Promise<GovernanceBody> {
    const updated = dissolveGovernanceBody(await this.require(tenantId, id), dissolvedOn);
    await this.repository.save(updated);
    await this.emit(governanceBodyDissolved(updated));
    return updated;
  }

  private async assertOrganizationExists(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForGovernanceError(organizationId);
    }
  }

  private async assertParentExists(tenantId: TenantId, parentBodyId: Uuid): Promise<void> {
    if (!(await this.repository.findById(tenantId, parentBodyId))) {
      throw new ParentGovernanceBodyNotFoundError(parentBodyId);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<GovernanceBody> {
    const body = await this.repository.findById(tenantId, id);
    if (!body) {
      throw new GovernanceBodyNotFoundError(id);
    }
    return body;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
