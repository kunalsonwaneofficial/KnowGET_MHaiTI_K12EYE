import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  addAudienceMembers,
  archiveAudience,
  type Audience,
  type CreateAudienceParams,
  createAudience,
  removeAudienceMembers,
  renameAudience,
  setAudienceCriteria,
  setAudienceDescription,
} from "./audience";
import {
  audienceArchived,
  audienceCreated,
  audienceCriteriaSet,
  audienceDescriptionSet,
  audienceMembersAdded,
  audienceMembersRemoved,
  audienceRenamed,
} from "./engagement-events";
import {
  AudienceNotFoundError,
  DuplicateAudienceCodeError,
  OrganizationNotFoundForEngagementError,
} from "./errors";
import type { AudienceRepository, OrganizationDirectory } from "./ports";

export interface AudienceServiceDeps {
  readonly repository: AudienceRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for audiences — the reusable recipient groups. Creates an audience (validating the
 * organization and a unique code per tenant), renames it, edits its description and criteria label, adds and
 * removes members, and archives it, publishing the audience events.
 */
export class AudienceService {
  private readonly repository: AudienceRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AudienceServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async create(input: CreateAudienceParams): Promise<Audience> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForEngagementError(input.organizationId);
    }
    if (await this.repository.findByCode(input.tenantId, input.code.trim())) {
      throw new DuplicateAudienceCodeError(input.code.trim());
    }
    const audience = createAudience(input);
    await this.repository.save(audience);
    await this.emit(audienceCreated(audience));
    return audience;
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<Audience> {
    const updated = renameAudience(await this.require(tenantId, id), name);
    await this.repository.save(updated);
    await this.emit(audienceRenamed(updated));
    return updated;
  }

  async setDescription(
    tenantId: TenantId,
    id: Uuid,
    description: string | null,
  ): Promise<Audience> {
    const updated = setAudienceDescription(await this.require(tenantId, id), description);
    await this.repository.save(updated);
    await this.emit(audienceDescriptionSet(updated));
    return updated;
  }

  async setCriteria(tenantId: TenantId, id: Uuid, criteriaLabel: string | null): Promise<Audience> {
    const updated = setAudienceCriteria(await this.require(tenantId, id), criteriaLabel);
    await this.repository.save(updated);
    await this.emit(audienceCriteriaSet(updated));
    return updated;
  }

  async addMembers(tenantId: TenantId, id: Uuid, personIds: readonly Uuid[]): Promise<Audience> {
    const updated = addAudienceMembers(await this.require(tenantId, id), personIds);
    await this.repository.save(updated);
    await this.emit(audienceMembersAdded(updated));
    return updated;
  }

  async removeMembers(tenantId: TenantId, id: Uuid, personIds: readonly Uuid[]): Promise<Audience> {
    const updated = removeAudienceMembers(await this.require(tenantId, id), personIds);
    await this.repository.save(updated);
    await this.emit(audienceMembersRemoved(updated));
    return updated;
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<Audience> {
    const updated = archiveAudience(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(audienceArchived(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Audience> {
    return this.require(tenantId, id);
  }

  async getByCode(tenantId: TenantId, code: string): Promise<Audience> {
    const audience = await this.repository.findByCode(tenantId, code);
    if (!audience) {
      throw new AudienceNotFoundError(code);
    }
    return audience;
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Audience[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Audience> {
    const audience = await this.repository.findById(tenantId, id);
    if (!audience) {
      throw new AudienceNotFoundError(id);
    }
    return audience;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
