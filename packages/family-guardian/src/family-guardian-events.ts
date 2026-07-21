import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { Family } from "./family";
import type { Guardian } from "./guardian";

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
