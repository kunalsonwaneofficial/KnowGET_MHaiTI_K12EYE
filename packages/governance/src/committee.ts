import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  CommitteeMemberNotFoundError,
  CommitteeRoleConflictError,
  DuplicateCommitteeMemberError,
  EmptyCommitteeNameError,
  InvalidCommitteeTransitionError,
} from "./errors";

/** A member's role on a committee. At most one `chair` and one `secretary`. */
export type CommitteeRole = "chair" | "secretary" | "member";

export type CommitteeStatus = "active" | "dissolved";

export interface CommitteeMember {
  readonly personId: Uuid;
  readonly role: CommitteeRole;
  /** ISO calendar date the person was appointed to the committee. */
  readonly appointedOn: string | null;
}

/**
 * An operational committee constituted under the institution's governance. It
 * carries a composition (members with roles — a single chair and secretary), a
 * mandate (purpose + terms of reference), and a lifecycle. Reports to a governance
 * body (optional) and serves an Organization node.
 */
export interface Committee {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** The governance body this committee reports to, if any. */
  readonly governanceBodyId: Uuid | null;
  readonly name: string;
  readonly purpose: string | null;
  readonly termsOfReference: string | null;
  readonly members: readonly CommitteeMember[];
  readonly status: CommitteeStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateCommitteeParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly name: string;
  readonly governanceBodyId?: Uuid | null;
  readonly purpose?: string | null;
  readonly termsOfReference?: string | null;
}

/** Create a new, `active` committee with no members (rejecting an empty name). */
export function createCommittee(params: CreateCommitteeParams): Committee {
  const name = params.name.trim();
  if (name.length === 0) {
    throw new EmptyCommitteeNameError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    governanceBodyId: params.governanceBodyId ?? null,
    name,
    purpose: params.purpose?.trim() || null,
    termsOfReference: params.termsOfReference?.trim() || null,
    members: [],
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (committee: Committee, patch: Partial<Committee>): Committee => ({
  ...committee,
  ...patch,
  updatedAt: nowIso(),
});

/** The person holding a unique role (`chair`/`secretary`), or null if unfilled. */
export const roleHolder = (committee: Committee, role: CommitteeRole): CommitteeMember | null =>
  committee.members.find((m) => m.role === role) ?? null;

export interface AppointMemberParams {
  readonly personId: Uuid;
  readonly role: CommitteeRole;
  readonly appointedOn?: string | null;
}

/**
 * Appoint a person to the committee. Rejects a duplicate person, and enforces at
 * most one chair and one secretary.
 */
export function appointMember(committee: Committee, params: AppointMemberParams): Committee {
  if (committee.members.some((m) => m.personId === params.personId)) {
    throw new DuplicateCommitteeMemberError(params.personId);
  }
  assertRoleAvailable(committee, params.role);
  const member: CommitteeMember = {
    personId: params.personId,
    role: params.role,
    appointedOn: params.appointedOn ?? null,
  };
  return touch(committee, { members: [...committee.members, member] });
}

/** Remove a person from the committee (must currently be a member). */
export function removeMember(committee: Committee, personId: Uuid): Committee {
  if (!committee.members.some((m) => m.personId === personId)) {
    throw new CommitteeMemberNotFoundError(personId);
  }
  return touch(committee, { members: committee.members.filter((m) => m.personId !== personId) });
}

/** Change a member's role, re-checking chair/secretary uniqueness. */
export function changeMemberRole(
  committee: Committee,
  personId: Uuid,
  role: CommitteeRole,
): Committee {
  const current = committee.members.find((m) => m.personId === personId);
  if (!current) {
    throw new CommitteeMemberNotFoundError(personId);
  }
  if (current.role !== role) {
    assertRoleAvailable(committee, role);
  }
  return touch(committee, {
    members: committee.members.map((m) => (m.personId === personId ? { ...m, role } : m)),
  });
}

function assertRoleAvailable(committee: Committee, role: CommitteeRole): void {
  if (role !== "member" && roleHolder(committee, role)) {
    throw new CommitteeRoleConflictError(role);
  }
}

/** Dissolve an active committee; a dissolved committee cannot be dissolved again. */
export function dissolveCommittee(committee: Committee): Committee {
  if (committee.status !== "active") {
    throw new InvalidCommitteeTransitionError(committee.status, "dissolved");
  }
  return touch(committee, { status: "dissolved" });
}

/** Revise a committee's terms of reference (an empty string clears them). */
export function reviseCommitteeTerms(
  committee: Committee,
  termsOfReference: string | null,
): Committee {
  return touch(committee, { termsOfReference: termsOfReference?.trim() || null });
}

/** True when the committee is currently in effect (status `active`). */
export const isActiveCommittee = (committee: Committee): boolean => committee.status === "active";
