import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { normalizeTypeKey } from "./entity-type";
import { isKnowledgeEntityActive, type KnowledgeEntity } from "./knowledge-entity";
import { isRelationshipTypeUsable } from "./relationship-type";
import {
  type CreateSemanticRelationshipParams,
  type SemanticRelationship,
  closeRelationship,
  createSemanticRelationship,
  markSuperseded,
  retractRelationship,
  supersedeRelationship,
} from "./semantic-relationship";
import {
  relationshipAsserted,
  relationshipClosed,
  relationshipRetracted,
  relationshipSuperseded,
} from "./knowledge-events";
import {
  EndpointTypeMismatchError,
  SemanticRelationshipNotFoundError,
  UnknownRelationshipEndpointError,
  UnknownRelationshipTypeError,
} from "./errors";
import type {
  KnowledgeEntityRepository,
  RelationshipTypeRepository,
  SemanticRelationshipRepository,
} from "./ports";

export interface SemanticRelationshipServiceDeps {
  readonly repository: SemanticRelationshipRepository;
  readonly entities: KnowledgeEntityRepository;
  readonly relationshipTypes: RelationshipTypeRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for semantic relationships (graph edges). Asserting an edge validates the whole ontology
 * grammar: the relationship type is registered and usable, both endpoints are active knowledge entities, and
 * their entity types match what the relationship type requires (`source: student → target: course`). It closes
 * an edge's window, retracts it, or supersedes it with a next version (preserving the prior — the digital
 * memory), publishing the edge events.
 */
export class SemanticRelationshipService {
  private readonly repository: SemanticRelationshipRepository;
  private readonly entities: KnowledgeEntityRepository;
  private readonly relationshipTypes: RelationshipTypeRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: SemanticRelationshipServiceDeps) {
    this.repository = deps.repository;
    this.entities = deps.entities;
    this.relationshipTypes = deps.relationshipTypes;
    this.events = deps.events;
  }

  async assert(input: CreateSemanticRelationshipParams): Promise<SemanticRelationship> {
    const typeKey = normalizeTypeKey(input.relationshipTypeKey);
    const relType = await this.relationshipTypes.findByKey(input.tenantId, typeKey);
    if (!relType || !isRelationshipTypeUsable(relType)) {
      throw new UnknownRelationshipTypeError(typeKey);
    }
    const source = await this.requireActiveEntity(input.tenantId, input.sourceEntityId, "source");
    const target = await this.requireActiveEntity(input.tenantId, input.targetEntityId, "target");
    if (source.entityTypeKey !== relType.sourceEntityTypeKey) {
      throw new EndpointTypeMismatchError(
        "source",
        relType.sourceEntityTypeKey,
        source.entityTypeKey,
      );
    }
    if (target.entityTypeKey !== relType.targetEntityTypeKey) {
      throw new EndpointTypeMismatchError(
        "target",
        relType.targetEntityTypeKey,
        target.entityTypeKey,
      );
    }
    const relationship = createSemanticRelationship(input);
    await this.repository.save(relationship);
    await this.emit(relationshipAsserted(relationship));
    return relationship;
  }

  async close(tenantId: TenantId, id: Uuid, validTo: string): Promise<SemanticRelationship> {
    const updated = closeRelationship(await this.require(tenantId, id), validTo);
    await this.repository.save(updated);
    await this.emit(relationshipClosed(updated));
    return updated;
  }

  async retract(tenantId: TenantId, id: Uuid): Promise<SemanticRelationship> {
    const updated = retractRelationship(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(relationshipRetracted(updated));
    return updated;
  }

  /**
   * Supersede an asserted edge with a next version: the prior is marked superseded (kept), a new asserted
   * version (`version + 1`, `supersedesId` the prior) is stored. Returns the new version.
   */
  async supersede(
    tenantId: TenantId,
    id: Uuid,
    patch: { validFrom?: string; validTo?: string | null } = {},
  ): Promise<SemanticRelationship> {
    const current = await this.require(tenantId, id);
    const successor = supersedeRelationship(current, patch);
    const superseded = markSuperseded(current);
    await this.repository.save(superseded);
    await this.repository.save(successor);
    await this.emit(relationshipSuperseded(superseded));
    await this.emit(relationshipAsserted(successor));
    return successor;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<SemanticRelationship> {
    return this.require(tenantId, id);
  }

  async listForEntity(tenantId: TenantId, entityId: Uuid): Promise<SemanticRelationship[]> {
    return this.repository.listByEntity(tenantId, entityId);
  }

  private async requireActiveEntity(
    tenantId: TenantId,
    id: Uuid,
    end: "source" | "target",
  ): Promise<KnowledgeEntity> {
    const entity = await this.entities.findById(tenantId, id);
    if (!entity || !isKnowledgeEntityActive(entity)) {
      throw new UnknownRelationshipEndpointError(id, end);
    }
    return entity;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<SemanticRelationship> {
    const rel = await this.repository.findById(tenantId, id);
    if (!rel) {
      throw new SemanticRelationshipNotFoundError(id);
    }
    return rel;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
