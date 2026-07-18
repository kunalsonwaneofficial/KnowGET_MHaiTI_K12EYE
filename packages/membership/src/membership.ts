import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { InvalidMembershipStatusTransitionError } from "./errors";
import { normalizeRoles } from "./roles";

/**
 * Lifecycle of a membership.
 * - `active`    — the person currently plays these roles in the organization.
 * - `suspended` — temporarily inactive (reversible).
 * - `ended`     — terminal; the affiliation is over.
 */
export type MembershipStatus = "active" | "suspended" | "ended";

/**
 * A person's affiliation with an organization node — the join that says "this
 * person plays these roles in this organizational unit". Persona-agnostic and
 * scope-bearing: the role names are opaque (their permissions are resolved by
 * the authorization engine), and the organization gives the affiliation a scope
 * that later ABAC policies can use.
 */
export interface Membership {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly personId: Uuid;
  readonly organizationId: Uuid;
  readonly roles: readonly string[];
  readonly status: MembershipStatus;
  /** ISO calendar date the affiliation is effective from (or null if unknown). */
  readonly startDate: string | null;
  /** ISO calendar date the affiliation ended (set when `ended`). */
  readonly endDate: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateMembershipParams {
  readonly tenantId: TenantId;
  readonly personId: Uuid;
  readonly organizationId: Uuid;
  readonly roles: readonly string[];
  readonly startDate?: string | null;
}

/** Create a new, `active` membership (roles normalized; at least one required). */
export function createMembership(params: CreateMembershipParams): Membership {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    personId: params.personId,
    organizationId: params.organizationId,
    roles: normalizeRoles(params.roles),
    status: "active",
    startDate: params.startDate ?? null,
    endDate: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (membership: Membership, patch: Partial<Membership>): Membership => ({
  ...membership,
  ...patch,
  updatedAt: nowIso(),
});

const STATUS_TRANSITIONS: Readonly<Record<MembershipStatus, readonly MembershipStatus[]>> = {
  active: ["suspended", "ended"],
  suspended: ["active", "ended"],
  ended: [],
};

function assertTransition(from: MembershipStatus, to: MembershipStatus): void {
  if (!STATUS_TRANSITIONS[from].includes(to)) {
    throw new InvalidMembershipStatusTransitionError(from, to);
  }
}

/** Replace the granted roles (normalized; at least one required). */
export const changeMembershipRoles = (
  membership: Membership,
  roles: readonly string[],
): Membership => touch(membership, { roles: normalizeRoles(roles) });

export function suspendMembership(membership: Membership): Membership {
  assertTransition(membership.status, "suspended");
  return touch(membership, { status: "suspended" });
}

export function reinstateMembership(membership: Membership): Membership {
  assertTransition(membership.status, "active");
  return touch(membership, { status: "active" });
}

export function endMembership(membership: Membership, endDate?: string | null): Membership {
  assertTransition(membership.status, "ended");
  return touch(membership, { status: "ended", endDate: endDate ?? null });
}

/** True when the membership currently grants its roles (status `active`). */
export const isActiveMembership = (membership: Membership): boolean =>
  membership.status === "active";
