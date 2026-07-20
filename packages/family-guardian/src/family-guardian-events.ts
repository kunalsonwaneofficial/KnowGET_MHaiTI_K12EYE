import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { Family } from "./family";

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
