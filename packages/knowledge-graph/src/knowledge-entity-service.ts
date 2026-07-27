import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { isEntityTypeUsable } from "./entity-type";
import {
  type CreateKnowledgeEntityParams,
  type KnowledgeEntity,
  archiveKnowledgeEntity,
  createKnowledgeEntity,
  isKnowledgeEntityActive,
  mergeKnowledgeEntity,
  normalizeSourceDomain,
  relabelKnowledgeEntity,
} from "./knowledge-entity";
import { normalizeTypeKey } from "./entity-type";
import {
  knowledgeEntityArchived,
  knowledgeEntityCreated,
  knowledgeEntityMerged,
  knowledgeEntityRelabeled,
} from "./knowledge-events";
import {
  DuplicateKnowledgeEntityError,
  KnowledgeEntityNotFoundError,
  MergeTargetNotFoundError,
  OrganizationNotFoundForKnowledgeError,
  UnknownEntityTypeError,
} from "./errors";
import type {
  EntityTypeRepository,
  KnowledgeEntityRepository,
  OrganizationDirectory,
} from "./ports";

export interface KnowledgeEntityServiceDeps {
  readonly repository: KnowledgeEntityRepository;
  readonly entityTypes: EntityTypeRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for knowledge entities (graph nodes). Creates a node (validating the owning organization,
 * that the entity type is a registered *usable* ontology type, and one node per domain record), relabels it,
 * resolves identity by merging it into a canonical twin (validating the target exists and is active), and
 * archives it — publishing the node events. The node references a domain record; this service never re-models it.
 */
export class KnowledgeEntityService {
  private readonly repository: KnowledgeEntityRepository;
  private readonly entityTypes: EntityTypeRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: KnowledgeEntityServiceDeps) {
    this.repository = deps.repository;
    this.entityTypes = deps.entityTypes;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async create(input: CreateKnowledgeEntityParams): Promise<KnowledgeEntity> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForKnowledgeError(input.organizationId);
    }
    const entityTypeKey = normalizeTypeKey(input.entityTypeKey);
    const type = await this.entityTypes.findByKey(input.tenantId, entityTypeKey);
    if (!type || !isEntityTypeUsable(type)) {
      throw new UnknownEntityTypeError(entityTypeKey);
    }
    const sourceDomain = normalizeSourceDomain(input.sourceDomain);
    const sourceRef = input.sourceRef.trim();
    if (await this.repository.findBySource(input.tenantId, sourceDomain, sourceRef)) {
      throw new DuplicateKnowledgeEntityError(sourceDomain, sourceRef);
    }
    const entity = createKnowledgeEntity(input);
    await this.repository.save(entity);
    await this.emit(knowledgeEntityCreated(entity));
    return entity;
  }

  async relabel(tenantId: TenantId, id: Uuid, label: string | null): Promise<KnowledgeEntity> {
    const updated = relabelKnowledgeEntity(await this.require(tenantId, id), label);
    await this.repository.save(updated);
    await this.emit(knowledgeEntityRelabeled(updated));
    return updated;
  }

  async merge(tenantId: TenantId, id: Uuid, intoId: Uuid): Promise<KnowledgeEntity> {
    const entity = await this.require(tenantId, id);
    const target = await this.repository.findById(tenantId, intoId);
    if (!target || !isKnowledgeEntityActive(target)) {
      throw new MergeTargetNotFoundError(intoId);
    }
    const updated = mergeKnowledgeEntity(entity, intoId);
    await this.repository.save(updated);
    await this.emit(knowledgeEntityMerged(updated));
    return updated;
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<KnowledgeEntity> {
    const updated = archiveKnowledgeEntity(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(knowledgeEntityArchived(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<KnowledgeEntity> {
    return this.require(tenantId, id);
  }

  async getBySource(
    tenantId: TenantId,
    sourceDomain: string,
    sourceRef: string,
  ): Promise<KnowledgeEntity | null> {
    return this.repository.findBySource(
      tenantId,
      normalizeSourceDomain(sourceDomain),
      sourceRef.trim(),
    );
  }

  async listByType(tenantId: TenantId, entityTypeKey: string): Promise<KnowledgeEntity[]> {
    return this.repository.listByType(tenantId, normalizeTypeKey(entityTypeKey));
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<KnowledgeEntity> {
    const entity = await this.repository.findById(tenantId, id);
    if (!entity) {
      throw new KnowledgeEntityNotFoundError(id);
    }
    return entity;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
