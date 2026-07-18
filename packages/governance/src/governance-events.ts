import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { AuthorityScope } from "./authority-scope";
import type { Committee } from "./committee";
import type { Delegation } from "./delegation";
import type { GovernanceBody } from "./governance-body";
import type { GovernanceBodyType } from "./governance-body-type";
import type { Policy } from "./policy";
import type { PolicyCategory } from "./policy-category";

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

export const POLICY_PUBLISHED = "governance.policy.published";
export const POLICY_RETIRED = "governance.policy.retired";

export interface PolicyPayload {
  readonly policyId: Uuid;
  readonly organizationId: Uuid;
  readonly category: PolicyCategory;
  readonly version: number;
}

const policyPayload = (policy: Policy): PolicyPayload => ({
  policyId: policy.id,
  organizationId: policy.organizationId,
  category: policy.category,
  version: policy.version,
});

export type PolicyPublishedEvent = DomainEvent<typeof POLICY_PUBLISHED, PolicyPayload>;

export const policyPublished = (policy: Policy): PolicyPublishedEvent =>
  createEvent(POLICY_PUBLISHED, policyPayload(policy), { tenantId: policy.tenantId });

export const policyRetired = (policy: Policy): DomainEvent<typeof POLICY_RETIRED, PolicyPayload> =>
  createEvent(POLICY_RETIRED, policyPayload(policy), { tenantId: policy.tenantId });

export const DELEGATION_GRANTED = "governance.delegation.granted";
export const DELEGATION_REVOKED = "governance.delegation.revoked";

export interface DelegationPayload {
  readonly delegationId: Uuid;
  readonly organizationId: Uuid;
  readonly delegatorId: Uuid;
  readonly delegateId: Uuid;
  readonly scope: AuthorityScope;
}

const delegationPayload = (delegation: Delegation): DelegationPayload => ({
  delegationId: delegation.id,
  organizationId: delegation.organizationId,
  delegatorId: delegation.delegatorId,
  delegateId: delegation.delegateId,
  scope: delegation.scope,
});

export type DelegationGrantedEvent = DomainEvent<typeof DELEGATION_GRANTED, DelegationPayload>;

export const delegationGranted = (delegation: Delegation): DelegationGrantedEvent =>
  createEvent(DELEGATION_GRANTED, delegationPayload(delegation), { tenantId: delegation.tenantId });

export const delegationRevoked = (
  delegation: Delegation,
): DomainEvent<typeof DELEGATION_REVOKED, DelegationPayload> =>
  createEvent(DELEGATION_REVOKED, delegationPayload(delegation), { tenantId: delegation.tenantId });
