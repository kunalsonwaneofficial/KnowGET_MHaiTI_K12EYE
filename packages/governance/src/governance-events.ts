import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { Committee } from "./committee";
import type { GovernanceBody } from "./governance-body";
import type { GovernanceBodyType } from "./governance-body-type";

export const GOVERNANCE_BODY_CREATED = "governance.body.created";
export const GOVERNANCE_BODY_DISSOLVED = "governance.body.dissolved";

export interface GovernanceBodyPayload {
  readonly governanceBodyId: Uuid;
  readonly organizationId: Uuid;
  readonly type: GovernanceBodyType;
  readonly parentBodyId: Uuid | null;
}

const bodyPayload = (body: GovernanceBody): GovernanceBodyPayload => ({
  governanceBodyId: body.id,
  organizationId: body.organizationId,
  type: body.type,
  parentBodyId: body.parentBodyId,
});

export type GovernanceBodyCreatedEvent = DomainEvent<
  typeof GOVERNANCE_BODY_CREATED,
  GovernanceBodyPayload
>;

export const governanceBodyCreated = (body: GovernanceBody): GovernanceBodyCreatedEvent =>
  createEvent(GOVERNANCE_BODY_CREATED, bodyPayload(body), { tenantId: body.tenantId });

export const governanceBodyDissolved = (
  body: GovernanceBody,
): DomainEvent<typeof GOVERNANCE_BODY_DISSOLVED, GovernanceBodyPayload> =>
  createEvent(GOVERNANCE_BODY_DISSOLVED, bodyPayload(body), { tenantId: body.tenantId });

export const COMMITTEE_CREATED = "governance.committee.created";

export interface CommitteePayload {
  readonly committeeId: Uuid;
  readonly organizationId: Uuid;
  readonly governanceBodyId: Uuid | null;
}

export type CommitteeCreatedEvent = DomainEvent<typeof COMMITTEE_CREATED, CommitteePayload>;

export const committeeCreated = (committee: Committee): CommitteeCreatedEvent =>
  createEvent(
    COMMITTEE_CREATED,
    {
      committeeId: committee.id,
      organizationId: committee.organizationId,
      governanceBodyId: committee.governanceBodyId,
    },
    { tenantId: committee.tenantId },
  );
