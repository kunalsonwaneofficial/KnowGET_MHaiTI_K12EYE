import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  type CreateEntityTypeParams,
  type EntityType,
  activateEntityType,
  createEntityType,
  deprecateEntityType,
  describeEntityType,
  normalizeTypeKey,
} from "./entity-type";
import {
  entityTypeActivated,
  entityTypeCreated,
  entityTypeDeprecated,
  entityTypeDescribed,
} from "./knowledge-events";
import {
  DuplicateEntityTypeError,
  EntityTypeNotFoundError,
  OrganizationNotFoundForKnowledgeError,
} from "./errors";
import type { EntityTypeRepository, OrganizationDirectory } from "./ports";

export interface EntityTypeServiceDeps {
  readonly repository: EntityTypeRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for ontology entity types. Registers a type (validating the owning organization and the
 * one-key-per-tenant rule), edits and drives `draft → active → deprecated`, publishing the type events. The
 * ontology is the tenant's extensible vocabulary of node classes; this service is how it grows.
 */
export class EntityTypeService {
  private readonly repository: EntityTypeRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: EntityTypeServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async create(input: CreateEntityTypeParams): Promise<EntityType> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForKnowledgeError(input.organizationId);
    }
    const key = normalizeTypeKey(input.key);
    if (await this.repository.findByKey(input.tenantId, key)) {
      throw new DuplicateEntityTypeError(key);
    }
    const type = createEntityType(input);
    await this.repository.save(type);
    await this.emit(entityTypeCreated(type));
    return type;
  }

  async describe(
    tenantId: TenantId,
    id: Uuid,
    patch: { label?: string; description?: string | null },
  ): Promise<EntityType> {
    const updated = describeEntityType(await this.require(tenantId, id), patch);
    await this.repository.save(updated);
    await this.emit(entityTypeDescribed(updated));
    return updated;
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<EntityType> {
    const updated = activateEntityType(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(entityTypeActivated(updated));
    return updated;
  }

  async deprecate(tenantId: TenantId, id: Uuid): Promise<EntityType> {
    const updated = deprecateEntityType(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(entityTypeDeprecated(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<EntityType> {
    return this.require(tenantId, id);
  }

  async getByKey(tenantId: TenantId, key: string): Promise<EntityType | null> {
    return this.repository.findByKey(tenantId, normalizeTypeKey(key));
  }

  async list(tenantId: TenantId): Promise<EntityType[]> {
    return this.repository.listByTenant(tenantId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<EntityType> {
    const type = await this.repository.findById(tenantId, id);
    if (!type) {
      throw new EntityTypeNotFoundError(id);
    }
    return type;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
