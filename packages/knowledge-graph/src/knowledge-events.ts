import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { EntityType } from "./entity-type";
import type { KnowledgeEntity } from "./knowledge-entity";
import type { Assertion } from "./assertion";
import type { EntityMemory } from "./entity-memory";
import type { RelationshipType } from "./relationship-type";
import type { SemanticRelationship } from "./semantic-relationship";

/**
 * Domain events for the Institutional Knowledge Graph (P2-D25), on the `knowledge.*` namespace. Payloads carry
 * ids, ontology keys, statuses and counts only — never free text (no label, no description), never PII and
 * never the asserted value itself. Downstream intelligence domains (P2-D26+) subscribe to these; they must be
 * able to react to a graph change without receiving its content.
 */

// --- Entity type -----------------------------------------------------------------
export const ENTITY_TYPE_CREATED = "knowledge.entity_type.created";
export const ENTITY_TYPE_DESCRIBED = "knowledge.entity_type.described";
export const ENTITY_TYPE_ACTIVATED = "knowledge.entity_type.activated";
export const ENTITY_TYPE_DEPRECATED = "knowledge.entity_type.deprecated";

export interface EntityTypeEventPayload {
  readonly entityTypeId: Uuid;
  readonly organizationId: Uuid;
  readonly key: string;
  readonly status: string;
}

export type EntityTypeCreatedEvent = DomainEvent<
  typeof ENTITY_TYPE_CREATED,
  EntityTypeEventPayload
>;
export type EntityTypeDescribedEvent = DomainEvent<
  typeof ENTITY_TYPE_DESCRIBED,
  EntityTypeEventPayload
>;
export type EntityTypeActivatedEvent = DomainEvent<
  typeof ENTITY_TYPE_ACTIVATED,
  EntityTypeEventPayload
>;
export type EntityTypeDeprecatedEvent = DomainEvent<
  typeof ENTITY_TYPE_DEPRECATED,
  EntityTypeEventPayload
>;

const entityTypePayload = (type: EntityType): EntityTypeEventPayload => ({
  entityTypeId: type.id,
  organizationId: type.organizationId,
  key: type.key,
  status: type.status,
});

export const entityTypeCreated = (t: EntityType): EntityTypeCreatedEvent =>
  createEvent(ENTITY_TYPE_CREATED, entityTypePayload(t), { tenantId: t.tenantId });
export const entityTypeDescribed = (t: EntityType): EntityTypeDescribedEvent =>
  createEvent(ENTITY_TYPE_DESCRIBED, entityTypePayload(t), { tenantId: t.tenantId });
export const entityTypeActivated = (t: EntityType): EntityTypeActivatedEvent =>
  createEvent(ENTITY_TYPE_ACTIVATED, entityTypePayload(t), { tenantId: t.tenantId });
export const entityTypeDeprecated = (t: EntityType): EntityTypeDeprecatedEvent =>
  createEvent(ENTITY_TYPE_DEPRECATED, entityTypePayload(t), { tenantId: t.tenantId });

// --- Relationship type -----------------------------------------------------------
export const RELATIONSHIP_TYPE_CREATED = "knowledge.relationship_type.created";
export const RELATIONSHIP_TYPE_DESCRIBED = "knowledge.relationship_type.described";
export const RELATIONSHIP_TYPE_CARDINALITY_SET = "knowledge.relationship_type.cardinality_set";
export const RELATIONSHIP_TYPE_ACTIVATED = "knowledge.relationship_type.activated";
export const RELATIONSHIP_TYPE_DEPRECATED = "knowledge.relationship_type.deprecated";

export interface RelationshipTypeEventPayload {
  readonly relationshipTypeId: Uuid;
  readonly organizationId: Uuid;
  readonly key: string;
  readonly sourceEntityTypeKey: string;
  readonly targetEntityTypeKey: string;
  readonly status: string;
}

export type RelationshipTypeCreatedEvent = DomainEvent<
  typeof RELATIONSHIP_TYPE_CREATED,
  RelationshipTypeEventPayload
>;
export type RelationshipTypeDescribedEvent = DomainEvent<
  typeof RELATIONSHIP_TYPE_DESCRIBED,
  RelationshipTypeEventPayload
>;
export type RelationshipTypeCardinalitySetEvent = DomainEvent<
  typeof RELATIONSHIP_TYPE_CARDINALITY_SET,
  RelationshipTypeEventPayload
>;
export type RelationshipTypeActivatedEvent = DomainEvent<
  typeof RELATIONSHIP_TYPE_ACTIVATED,
  RelationshipTypeEventPayload
>;
export type RelationshipTypeDeprecatedEvent = DomainEvent<
  typeof RELATIONSHIP_TYPE_DEPRECATED,
  RelationshipTypeEventPayload
>;

const relationshipTypePayload = (type: RelationshipType): RelationshipTypeEventPayload => ({
  relationshipTypeId: type.id,
  organizationId: type.organizationId,
  key: type.key,
  sourceEntityTypeKey: type.sourceEntityTypeKey,
  targetEntityTypeKey: type.targetEntityTypeKey,
  status: type.status,
});

export const relationshipTypeCreated = (t: RelationshipType): RelationshipTypeCreatedEvent =>
  createEvent(RELATIONSHIP_TYPE_CREATED, relationshipTypePayload(t), { tenantId: t.tenantId });
export const relationshipTypeDescribed = (t: RelationshipType): RelationshipTypeDescribedEvent =>
  createEvent(RELATIONSHIP_TYPE_DESCRIBED, relationshipTypePayload(t), { tenantId: t.tenantId });
export const relationshipTypeCardinalitySet = (
  t: RelationshipType,
): RelationshipTypeCardinalitySetEvent =>
  createEvent(RELATIONSHIP_TYPE_CARDINALITY_SET, relationshipTypePayload(t), {
    tenantId: t.tenantId,
  });
export const relationshipTypeActivated = (t: RelationshipType): RelationshipTypeActivatedEvent =>
  createEvent(RELATIONSHIP_TYPE_ACTIVATED, relationshipTypePayload(t), { tenantId: t.tenantId });
export const relationshipTypeDeprecated = (t: RelationshipType): RelationshipTypeDeprecatedEvent =>
  createEvent(RELATIONSHIP_TYPE_DEPRECATED, relationshipTypePayload(t), { tenantId: t.tenantId });

// --- Knowledge entity (node) -----------------------------------------------------
export const ENTITY_CREATED = "knowledge.entity.created";
export const ENTITY_RELABELED = "knowledge.entity.relabeled";
export const ENTITY_MERGED = "knowledge.entity.merged";
export const ENTITY_ARCHIVED = "knowledge.entity.archived";

export interface KnowledgeEntityEventPayload {
  readonly entityId: Uuid;
  readonly organizationId: Uuid;
  readonly entityTypeKey: string;
  readonly sourceDomain: string;
  readonly status: string;
  readonly mergedIntoId: Uuid | null;
}

export type KnowledgeEntityCreatedEvent = DomainEvent<
  typeof ENTITY_CREATED,
  KnowledgeEntityEventPayload
>;
export type KnowledgeEntityRelabeledEvent = DomainEvent<
  typeof ENTITY_RELABELED,
  KnowledgeEntityEventPayload
>;
export type KnowledgeEntityMergedEvent = DomainEvent<
  typeof ENTITY_MERGED,
  KnowledgeEntityEventPayload
>;
export type KnowledgeEntityArchivedEvent = DomainEvent<
  typeof ENTITY_ARCHIVED,
  KnowledgeEntityEventPayload
>;

const entityPayload = (entity: KnowledgeEntity): KnowledgeEntityEventPayload => ({
  entityId: entity.id,
  organizationId: entity.organizationId,
  entityTypeKey: entity.entityTypeKey,
  sourceDomain: entity.sourceDomain,
  status: entity.status,
  mergedIntoId: entity.mergedIntoId,
});

export const knowledgeEntityCreated = (e: KnowledgeEntity): KnowledgeEntityCreatedEvent =>
  createEvent(ENTITY_CREATED, entityPayload(e), { tenantId: e.tenantId });
export const knowledgeEntityRelabeled = (e: KnowledgeEntity): KnowledgeEntityRelabeledEvent =>
  createEvent(ENTITY_RELABELED, entityPayload(e), { tenantId: e.tenantId });
export const knowledgeEntityMerged = (e: KnowledgeEntity): KnowledgeEntityMergedEvent =>
  createEvent(ENTITY_MERGED, entityPayload(e), { tenantId: e.tenantId });
export const knowledgeEntityArchived = (e: KnowledgeEntity): KnowledgeEntityArchivedEvent =>
  createEvent(ENTITY_ARCHIVED, entityPayload(e), { tenantId: e.tenantId });

// --- Semantic relationship (edge) ------------------------------------------------
export const RELATIONSHIP_ASSERTED = "knowledge.relationship.asserted";
export const RELATIONSHIP_CLOSED = "knowledge.relationship.closed";
export const RELATIONSHIP_SUPERSEDED = "knowledge.relationship.superseded";
export const RELATIONSHIP_RETRACTED = "knowledge.relationship.retracted";

export interface SemanticRelationshipEventPayload {
  readonly relationshipId: Uuid;
  readonly organizationId: Uuid;
  readonly relationshipTypeKey: string;
  readonly sourceEntityId: Uuid;
  readonly targetEntityId: Uuid;
  readonly version: number;
  readonly supersedesId: Uuid | null;
  readonly status: string;
}

export type SemanticRelationshipAssertedEvent = DomainEvent<
  typeof RELATIONSHIP_ASSERTED,
  SemanticRelationshipEventPayload
>;
export type SemanticRelationshipClosedEvent = DomainEvent<
  typeof RELATIONSHIP_CLOSED,
  SemanticRelationshipEventPayload
>;
export type SemanticRelationshipSupersededEvent = DomainEvent<
  typeof RELATIONSHIP_SUPERSEDED,
  SemanticRelationshipEventPayload
>;
export type SemanticRelationshipRetractedEvent = DomainEvent<
  typeof RELATIONSHIP_RETRACTED,
  SemanticRelationshipEventPayload
>;

const relationshipPayload = (rel: SemanticRelationship): SemanticRelationshipEventPayload => ({
  relationshipId: rel.id,
  organizationId: rel.organizationId,
  relationshipTypeKey: rel.relationshipTypeKey,
  sourceEntityId: rel.sourceEntityId,
  targetEntityId: rel.targetEntityId,
  version: rel.version,
  supersedesId: rel.supersedesId,
  status: rel.status,
});

export const relationshipAsserted = (r: SemanticRelationship): SemanticRelationshipAssertedEvent =>
  createEvent(RELATIONSHIP_ASSERTED, relationshipPayload(r), { tenantId: r.tenantId });
export const relationshipClosed = (r: SemanticRelationship): SemanticRelationshipClosedEvent =>
  createEvent(RELATIONSHIP_CLOSED, relationshipPayload(r), { tenantId: r.tenantId });
export const relationshipSuperseded = (
  r: SemanticRelationship,
): SemanticRelationshipSupersededEvent =>
  createEvent(RELATIONSHIP_SUPERSEDED, relationshipPayload(r), { tenantId: r.tenantId });
export const relationshipRetracted = (
  r: SemanticRelationship,
): SemanticRelationshipRetractedEvent =>
  createEvent(RELATIONSHIP_RETRACTED, relationshipPayload(r), { tenantId: r.tenantId });

// --- Assertion (evidence chain) --------------------------------------------------
export const ASSERTION_MADE = "knowledge.assertion.made";
export const ASSERTION_RETRACTED = "knowledge.assertion.retracted";

export interface AssertionEventPayload {
  readonly assertionId: Uuid;
  readonly organizationId: Uuid;
  readonly subjectKind: string;
  readonly subjectId: Uuid;
  readonly predicate: string;
  readonly method: string;
  readonly confidence: number;
  readonly derivedFromCount: number;
  readonly status: string;
}

export type AssertionMadeEvent = DomainEvent<typeof ASSERTION_MADE, AssertionEventPayload>;
export type AssertionRetractedEvent = DomainEvent<
  typeof ASSERTION_RETRACTED,
  AssertionEventPayload
>;

const assertionPayload = (a: Assertion): AssertionEventPayload => ({
  assertionId: a.id,
  organizationId: a.organizationId,
  subjectKind: a.subjectKind,
  subjectId: a.subjectId,
  predicate: a.predicate,
  method: a.method,
  confidence: a.confidence,
  derivedFromCount: a.derivedFrom.length,
  status: a.status,
});

export const assertionMade = (a: Assertion): AssertionMadeEvent =>
  createEvent(ASSERTION_MADE, assertionPayload(a), { tenantId: a.tenantId });
export const assertionRetracted = (a: Assertion): AssertionRetractedEvent =>
  createEvent(ASSERTION_RETRACTED, assertionPayload(a), { tenantId: a.tenantId });

// --- Entity memory (digital memory read model) -----------------------------------
export const ENTITY_MEMORY_REFRESHED = "knowledge.entity_memory.refreshed";

export interface EntityMemoryEventPayload {
  readonly entityMemoryId: Uuid;
  readonly organizationId: Uuid;
  readonly entityId: Uuid;
  readonly degree: number;
  readonly assertionCount: number;
  readonly aggregateConfidence: number;
}

export type EntityMemoryRefreshedEvent = DomainEvent<
  typeof ENTITY_MEMORY_REFRESHED,
  EntityMemoryEventPayload
>;

export const entityMemoryRefreshed = (m: EntityMemory): EntityMemoryRefreshedEvent =>
  createEvent(
    ENTITY_MEMORY_REFRESHED,
    {
      entityMemoryId: m.id,
      organizationId: m.organizationId,
      entityId: m.entityId,
      degree: m.degree,
      assertionCount: m.assertionCount,
      aggregateConfidence: m.aggregateConfidence,
    },
    { tenantId: m.tenantId },
  );
