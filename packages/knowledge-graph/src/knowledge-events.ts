import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { EntityType } from "./entity-type";
import type { RelationshipType } from "./relationship-type";

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
