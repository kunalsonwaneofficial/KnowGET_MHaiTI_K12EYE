import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { normalizeTypeKey } from "./entity-type";
import {
  type CreateRelationshipTypeParams,
  type RelationshipType,
  activateRelationshipType,
  createRelationshipType,
  deprecateRelationshipType,
  describeRelationshipType,
  setRelationshipCardinality,
} from "./relationship-type";
import type { Cardinality } from "./knowledge-value";
import {
  relationshipTypeActivated,
  relationshipTypeCardinalitySet,
  relationshipTypeCreated,
  relationshipTypeDeprecated,
  relationshipTypeDescribed,
} from "./knowledge-events";
import {
  DuplicateRelationshipTypeError,
  OrganizationNotFoundForKnowledgeError,
  RelationshipTypeNotFoundError,
  UnknownEntityTypeForRelationshipError,
} from "./errors";
import type {
  EntityTypeRepository,
  OrganizationDirectory,
  RelationshipTypeRepository,
} from "./ports";

export interface RelationshipTypeServiceDeps {
  readonly repository: RelationshipTypeRepository;
  readonly entityTypes: EntityTypeRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for ontology relationship types. Registers a type (validating the owning organization,
 * the one-key-per-tenant rule, and — the ontology's structural grammar — that both endpoint entity types are
 * registered), edits and drives `draft → active → deprecated`, publishing the type events. An edge may only be
 * created for a relationship type whose endpoints match; this service is where that grammar is defined.
 */
export class RelationshipTypeService {
  private readonly repository: RelationshipTypeRepository;
  private readonly entityTypes: EntityTypeRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: RelationshipTypeServiceDeps) {
    this.repository = deps.repository;
    this.entityTypes = deps.entityTypes;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async create(input: CreateRelationshipTypeParams): Promise<RelationshipType> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForKnowledgeError(input.organizationId);
    }
    const key = normalizeTypeKey(input.key);
    if (await this.repository.findByKey(input.tenantId, key)) {
      throw new DuplicateRelationshipTypeError(key);
    }
    await this.requireEntityType(input.tenantId, input.sourceEntityTypeKey);
    await this.requireEntityType(input.tenantId, input.targetEntityTypeKey);
    const type = createRelationshipType(input);
    await this.repository.save(type);
    await this.emit(relationshipTypeCreated(type));
    return type;
  }

  async describe(
    tenantId: TenantId,
    id: Uuid,
    patch: { label?: string; description?: string | null },
  ): Promise<RelationshipType> {
    const updated = describeRelationshipType(await this.require(tenantId, id), patch);
    await this.repository.save(updated);
    await this.emit(relationshipTypeDescribed(updated));
    return updated;
  }

  async setCardinality(
    tenantId: TenantId,
    id: Uuid,
    cardinality: Cardinality,
  ): Promise<RelationshipType> {
    const updated = setRelationshipCardinality(await this.require(tenantId, id), cardinality);
    await this.repository.save(updated);
    await this.emit(relationshipTypeCardinalitySet(updated));
    return updated;
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<RelationshipType> {
    const updated = activateRelationshipType(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(relationshipTypeActivated(updated));
    return updated;
  }

  async deprecate(tenantId: TenantId, id: Uuid): Promise<RelationshipType> {
    const updated = deprecateRelationshipType(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(relationshipTypeDeprecated(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<RelationshipType> {
    return this.require(tenantId, id);
  }

  async getByKey(tenantId: TenantId, key: string): Promise<RelationshipType | null> {
    return this.repository.findByKey(tenantId, normalizeTypeKey(key));
  }

  async list(tenantId: TenantId): Promise<RelationshipType[]> {
    return this.repository.listByTenant(tenantId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<RelationshipType> {
    const type = await this.repository.findById(tenantId, id);
    if (!type) {
      throw new RelationshipTypeNotFoundError(id);
    }
    return type;
  }

  private async requireEntityType(tenantId: TenantId, key: string): Promise<void> {
    const normalized = normalizeTypeKey(key);
    if (!(await this.entityTypes.findByKey(tenantId, normalized))) {
      throw new UnknownEntityTypeForRelationshipError(normalized);
    }
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
