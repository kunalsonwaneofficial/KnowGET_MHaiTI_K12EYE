import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { InvalidMembershipTransitionError } from "./errors";
import type { MembershipRole, MembershipStatus } from "./alumni-value";

/**
 * A chapter membership — an alumni profile's membership in a chapter, with a role. It runs `active → left`,
 * with `left → active` reactivation (so an alumnus who left can rejoin the same chapter). There is **one
 * membership row per (chapter, alumni profile)** — rejoining reactivates the existing row rather than creating
 * a second — so the uniqueness is absolute and DB-backed, not status-scoped. The active memberships an alumnus
 * holds feed the engagement engine.
 */
export interface ChapterMembership {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly chapterId: Uuid;
  readonly alumniProfileId: Uuid;
  readonly role: MembershipRole;
  readonly status: MembershipStatus;
  readonly joinedOn: string;
  readonly leftOn: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface JoinChapterParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly chapterId: Uuid;
  readonly alumniProfileId: Uuid;
  readonly joinedOn: string;
  readonly role?: MembershipRole;
}

/** Create a chapter membership (status `active`). Role defaults to `member`. */
export function joinChapterMembership(params: JoinChapterParams): ChapterMembership {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    chapterId: params.chapterId,
    alumniProfileId: params.alumniProfileId,
    role: params.role ?? "member",
    status: "active",
    joinedOn: params.joinedOn,
    leftOn: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  membership: ChapterMembership,
  patch: Partial<ChapterMembership>,
): ChapterMembership => ({
  ...membership,
  ...patch,
  updatedAt: nowIso(),
});

/** Set a membership's role; only while active. */
export function setMembershipRole(
  membership: ChapterMembership,
  role: MembershipRole,
): ChapterMembership {
  if (membership.status !== "active") {
    throw new InvalidMembershipTransitionError(membership.status, "role-set");
  }
  return touch(membership, { role });
}

/** Leave a chapter (`active → left`), stamping the leave date. */
export function leaveChapterMembership(
  membership: ChapterMembership,
  leftOn: string,
): ChapterMembership {
  if (membership.status !== "active") {
    throw new InvalidMembershipTransitionError(membership.status, "left");
  }
  return touch(membership, { status: "left", leftOn });
}

/**
 * Reactivate a left membership (`left → active`), clearing the leave date and restamping the join date. An
 * optional role updates the member's role on return (keeping the prior role when omitted).
 */
export function reactivateMembership(
  membership: ChapterMembership,
  joinedOn: string,
  role?: MembershipRole,
): ChapterMembership {
  if (membership.status !== "left") {
    throw new InvalidMembershipTransitionError(membership.status, "active");
  }
  return touch(membership, {
    status: "active",
    joinedOn,
    leftOn: null,
    role: role ?? membership.role,
  });
}

/** Whether the membership is active. */
export const isMembershipActive = (membership: ChapterMembership): boolean =>
  membership.status === "active";
