import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { Family } from "./family";
import type { Guardian } from "./guardian";
import type { StudentGuardianRelationship } from "./student-guardian-relationship";

// --- Family ----------------------------------------------------------------------
export const FAMILY_REGISTERED = "family.registered";

export interface FamilyRegisteredPayload {
  readonly familyId: Uuid;
  readonly organizationId: Uuid;
  readonly familyNumber: string;
}

export type FamilyRegisteredEvent = DomainEvent<typeof FAMILY_REGISTERED, FamilyRegisteredPayload>;

export const familyRegistered = (family: Family): FamilyRegisteredEvent =>
  createEvent(
    FAMILY_REGISTERED,
    {
      familyId: family.id,
      organizationId: family.organizationId,
      familyNumber: family.familyNumber,
    },
    { tenantId: family.tenantId },
  );

// --- Guardian --------------------------------------------------------------------
export const GUARDIAN_REGISTERED = "family.guardian.registered";

export interface GuardianRegisteredPayload {
  readonly guardianId: Uuid;
  readonly organizationId: Uuid;
  readonly personId: Uuid;
}

export type GuardianRegisteredEvent = DomainEvent<
  typeof GUARDIAN_REGISTERED,
  GuardianRegisteredPayload
>;

export const guardianRegistered = (guardian: Guardian): GuardianRegisteredEvent =>
  createEvent(
    GUARDIAN_REGISTERED,
    {
      guardianId: guardian.id,
      organizationId: guardian.organizationId,
      personId: guardian.personId,
    },
    { tenantId: guardian.tenantId },
  );

// --- Student–Guardian relationship -----------------------------------------------
export const GUARDIAN_ASSIGNED = "family.guardian.assigned";
export const GUARDIAN_REMOVED = "family.guardian.removed";
export const PICKUP_AUTHORIZATION_CHANGED = "family.pickup_authorization.changed";

export interface RelationshipEventPayload {
  readonly relationshipId: Uuid;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly guardianId: Uuid;
}

export type GuardianAssignedEvent = DomainEvent<typeof GUARDIAN_ASSIGNED, RelationshipEventPayload>;
export type GuardianRemovedEvent = DomainEvent<typeof GUARDIAN_REMOVED, RelationshipEventPayload>;

export interface PickupAuthorizationChangedPayload extends RelationshipEventPayload {
  readonly pickupAuthorized: boolean;
}

export type PickupAuthorizationChangedEvent = DomainEvent<
  typeof PICKUP_AUTHORIZATION_CHANGED,
  PickupAuthorizationChangedPayload
>;

const relationshipPayload = (
  relationship: StudentGuardianRelationship,
): RelationshipEventPayload => ({
  relationshipId: relationship.id,
  organizationId: relationship.organizationId,
  studentId: relationship.studentId,
  guardianId: relationship.guardianId,
});

export const guardianAssigned = (
  relationship: StudentGuardianRelationship,
): GuardianAssignedEvent =>
  createEvent(GUARDIAN_ASSIGNED, relationshipPayload(relationship), {
    tenantId: relationship.tenantId,
  });

export const guardianRemoved = (relationship: StudentGuardianRelationship): GuardianRemovedEvent =>
  createEvent(GUARDIAN_REMOVED, relationshipPayload(relationship), {
    tenantId: relationship.tenantId,
  });

export const pickupAuthorizationChanged = (
  relationship: StudentGuardianRelationship,
): PickupAuthorizationChangedEvent =>
  createEvent(
    PICKUP_AUTHORIZATION_CHANGED,
    {
      ...relationshipPayload(relationship),
      pickupAuthorized: relationship.responsibilities.pickupAuthorized,
    },
    { tenantId: relationship.tenantId },
  );
