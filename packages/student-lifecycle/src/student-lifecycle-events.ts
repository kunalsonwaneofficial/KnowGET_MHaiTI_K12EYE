import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { LeadSource } from "./lead-source";
import type { Prospect } from "./prospect";

// --- Prospect --------------------------------------------------------------------
export const PROSPECT_CREATED = "student.prospect.created";

export interface ProspectCreatedPayload {
  readonly prospectId: Uuid;
  readonly organizationId: Uuid;
  readonly personId: Uuid;
  readonly leadSource: LeadSource;
}

export type ProspectCreatedEvent = DomainEvent<typeof PROSPECT_CREATED, ProspectCreatedPayload>;

export const prospectCreated = (prospect: Prospect): ProspectCreatedEvent =>
  createEvent(
    PROSPECT_CREATED,
    {
      prospectId: prospect.id,
      organizationId: prospect.organizationId,
      personId: prospect.personId,
      leadSource: prospect.leadSource,
    },
    { tenantId: prospect.tenantId },
  );
