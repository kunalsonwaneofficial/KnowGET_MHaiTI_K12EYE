import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { Membership } from "./membership";

export const MEMBERSHIP_GRANTED = "membership.granted";
export const MEMBERSHIP_ROLES_CHANGED = "membership.roles_changed";
export const MEMBERSHIP_SUSPENDED = "membership.suspended";
export const MEMBERSHIP_REINSTATED = "membership.reinstated";
export const MEMBERSHIP_ENDED = "membership.ended";

export interface MembershipPayload {
  readonly membershipId: Uuid;
  readonly personId: Uuid;
  readonly organizationId: Uuid;
}
export interface MembershipRolesChangedPayload extends MembershipPayload {
  readonly roles: readonly string[];
}

const base = (membership: Membership): MembershipPayload => ({
  membershipId: membership.id,
  personId: membership.personId,
  organizationId: membership.organizationId,
});

export type MembershipGrantedEvent = DomainEvent<typeof MEMBERSHIP_GRANTED, MembershipPayload>;

export const membershipGranted = (membership: Membership): MembershipGrantedEvent =>
  createEvent(MEMBERSHIP_GRANTED, base(membership), { tenantId: membership.tenantId });

export const membershipRolesChanged = (
  membership: Membership,
): DomainEvent<typeof MEMBERSHIP_ROLES_CHANGED, MembershipRolesChangedPayload> =>
  createEvent(
    MEMBERSHIP_ROLES_CHANGED,
    { ...base(membership), roles: membership.roles },
    { tenantId: membership.tenantId },
  );

export const membershipSuspended = (
  membership: Membership,
): DomainEvent<typeof MEMBERSHIP_SUSPENDED, MembershipPayload> =>
  createEvent(MEMBERSHIP_SUSPENDED, base(membership), { tenantId: membership.tenantId });

export const membershipReinstated = (
  membership: Membership,
): DomainEvent<typeof MEMBERSHIP_REINSTATED, MembershipPayload> =>
  createEvent(MEMBERSHIP_REINSTATED, base(membership), { tenantId: membership.tenantId });

export const membershipEnded = (
  membership: Membership,
): DomainEvent<typeof MEMBERSHIP_ENDED, MembershipPayload> =>
  createEvent(MEMBERSHIP_ENDED, base(membership), { tenantId: membership.tenantId });
