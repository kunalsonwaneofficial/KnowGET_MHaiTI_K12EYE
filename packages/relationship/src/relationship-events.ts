import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { RelationshipKind } from "./kind";
import type { Relationship } from "./relationship";

export const RELATIONSHIP_CREATED = "relationship.created";
export const RELATIONSHIP_ENDED = "relationship.ended";

export interface RelationshipPayload {
  readonly relationshipId: Uuid;
  readonly fromPersonId: Uuid;
  readonly toPersonId: Uuid;
  readonly kind: RelationshipKind;
}

const base = (relationship: Relationship): RelationshipPayload => ({
  relationshipId: relationship.id,
  fromPersonId: relationship.fromPersonId,
  toPersonId: relationship.toPersonId,
  kind: relationship.kind,
});

export type RelationshipCreatedEvent = DomainEvent<
  typeof RELATIONSHIP_CREATED,
  RelationshipPayload
>;

export const relationshipCreated = (relationship: Relationship): RelationshipCreatedEvent =>
  createEvent(RELATIONSHIP_CREATED, base(relationship), { tenantId: relationship.tenantId });

export const relationshipEnded = (
  relationship: Relationship,
): DomainEvent<typeof RELATIONSHIP_ENDED, RelationshipPayload> =>
  createEvent(RELATIONSHIP_ENDED, base(relationship), { tenantId: relationship.tenantId });
