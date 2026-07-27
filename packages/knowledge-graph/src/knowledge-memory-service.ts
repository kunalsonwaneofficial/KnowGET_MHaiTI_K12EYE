import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { type EntityMemory, createEntityMemory, refreshEntityMemory } from "./entity-memory";
import { entityMemoryRefreshed } from "./knowledge-events";
import { isKnowledgeEntityActive } from "./knowledge-entity";
import type { EntityMemoryView, GraphSummary, Neighborhood } from "./knowledge-view";
import { entityMemory, summarizeGraph } from "./metrics";
import { neighborhood } from "./traversal";
import { liveRelationships } from "./temporal";
import { EntityMemoryNotFoundError, KnowledgeEntityNotFoundError } from "./errors";
import type {
  AssertionRepository,
  EntityMemoryRepository,
  KnowledgeEntityRepository,
  SemanticRelationshipRepository,
} from "./ports";

export interface KnowledgeMemoryServiceDeps {
  readonly memories: EntityMemoryRepository;
  readonly entities: KnowledgeEntityRepository;
  readonly relationships: SemanticRelationshipRepository;
  readonly assertions: AssertionRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * The refresh spine — where the pure engines meet persistence. It re-derives an entity's digital memory
 * (degree from the live edges via traversal, assertion counts and evidence-capped aggregate confidence via
 * provenance + metrics) and upserts the read model; it also serves live neighbourhood and graph-summary queries
 * without persisting. It authors nothing: everything it stores is a function of the entities, relationships and
 * assertions, so the memory can always be rebuilt.
 */
export class KnowledgeMemoryService {
  private readonly memories: EntityMemoryRepository;
  private readonly entities: KnowledgeEntityRepository;
  private readonly relationships: SemanticRelationshipRepository;
  private readonly assertions: AssertionRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: KnowledgeMemoryServiceDeps) {
    this.memories = deps.memories;
    this.entities = deps.entities;
    this.relationships = deps.relationships;
    this.assertions = deps.assertions;
    this.events = deps.events;
  }

  /** Re-derive and persist an entity's digital memory; upserts the one read model per entity. */
  async refreshForEntity(tenantId: TenantId, entityId: Uuid): Promise<EntityMemory> {
    const entity = await this.entities.findById(tenantId, entityId);
    if (!entity) {
      throw new KnowledgeEntityNotFoundError(entityId);
    }
    const view = await this.computeView(tenantId, entityId);
    const existing = await this.memories.findByEntity(tenantId, entityId);
    const memory = existing
      ? refreshEntityMemory(existing, view)
      : createEntityMemory({ tenantId, organizationId: entity.organizationId, entityId, view });
    await this.memories.save(memory);
    await this.emit(entityMemoryRefreshed(memory));
    return memory;
  }

  /** The live digital-memory view for an entity — computed on demand, not persisted. */
  async memoryForEntity(tenantId: TenantId, entityId: Uuid): Promise<EntityMemoryView> {
    return this.computeView(tenantId, entityId);
  }

  /** The persisted digital memory for an entity, or a not-found error if it has never been refreshed. */
  async getForEntity(tenantId: TenantId, entityId: Uuid): Promise<EntityMemory> {
    const memory = await this.memories.findByEntity(tenantId, entityId);
    if (!memory) {
      throw new EntityMemoryNotFoundError(entityId);
    }
    return memory;
  }

  /** The live neighbourhood of an entity over its live edges (out / in / degree). */
  async neighborhoodForEntity(tenantId: TenantId, entityId: Uuid): Promise<Neighborhood> {
    const live = liveRelationships(await this.relationships.listByEntity(tenantId, entityId));
    return neighborhood(entityId, live);
  }

  /** A descriptive summary of the tenant's graph — counts, per-type breakdowns and average degree. */
  async graphSummary(tenantId: TenantId): Promise<GraphSummary> {
    const active = (await this.entities.listByTenant(tenantId)).filter(isKnowledgeEntityActive);
    const relationships = await this.relationships.listByTenant(tenantId);
    const assertions = await this.assertions.listByTenant(tenantId);
    return summarizeGraph(
      active.map((e) => e.id),
      active.map((e) => e.entityTypeKey),
      relationships,
      assertions,
    );
  }

  private async computeView(tenantId: TenantId, entityId: Uuid): Promise<EntityMemoryView> {
    const live = liveRelationships(await this.relationships.listByEntity(tenantId, entityId));
    const entityAssertions = await this.assertions.listBySubject(tenantId, "entity", entityId);
    const pool = await this.assertions.listByTenant(tenantId);
    return entityMemory(entityId, live, entityAssertions, pool);
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
