import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyMembershipNumberError, InvalidMemberTransitionError } from "./errors";
import type { MemberCategory, MemberStatus } from "./library-value";

/**
 * A library member — a borrower. It links to a **Person** (P2-D01-M02) and carries a membership number
 * (unique within the tenant), a category (student/faculty/staff/alumni/guest) that drives borrowing
 * privileges via the circulation policy, and join/expiry dates. It runs `active ↔ suspended → expired`
 * (terminal). Only an active member can borrow or reserve. The organization is the library the membership
 * belongs to; the person's identity lives in the person domain and is never duplicated.
 */
export interface LibraryMember {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly personId: Uuid;
  readonly membershipNumber: string;
  readonly category: MemberCategory;
  readonly joinedOn: string;
  readonly expiresOn: string | null;
  readonly status: MemberStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RegisterMemberParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly personId: Uuid;
  readonly membershipNumber: string;
  readonly category: MemberCategory;
  readonly joinedOn: string;
  readonly expiresOn?: string | null;
}

/** Register a library member (status `active`). A non-empty membership number is required. */
export function registerMember(params: RegisterMemberParams): LibraryMember {
  const membershipNumber = params.membershipNumber.trim();
  if (membershipNumber.length === 0) {
    throw new EmptyMembershipNumberError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    personId: params.personId,
    membershipNumber,
    category: params.category,
    joinedOn: params.joinedOn,
    expiresOn: params.expiresOn?.trim() || null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (member: LibraryMember, patch: Partial<LibraryMember>): LibraryMember => ({
  ...member,
  ...patch,
  updatedAt: nowIso(),
});

/** Set the member's category. */
export const setMemberCategory = (member: LibraryMember, category: MemberCategory): LibraryMember =>
  touch(member, { category });

/** Set (or clear) the member's expiry date. */
export const setMemberExpiry = (member: LibraryMember, expiresOn: string | null): LibraryMember =>
  touch(member, { expiresOn: expiresOn?.trim() || null });

/** Suspend an active member (→ `suspended`). */
export function suspendMember(member: LibraryMember): LibraryMember {
  if (member.status !== "active") {
    throw new InvalidMemberTransitionError(member.status, "suspended");
  }
  return touch(member, { status: "suspended" });
}

/** Reinstate a suspended member (→ `active`). */
export function reinstateMember(member: LibraryMember): LibraryMember {
  if (member.status !== "suspended") {
    throw new InvalidMemberTransitionError(member.status, "active");
  }
  return touch(member, { status: "active" });
}

/** Expire a member (→ `expired`, terminal). An active or suspended member can be expired. */
export function expireMember(member: LibraryMember): LibraryMember {
  if (member.status === "expired") {
    throw new InvalidMemberTransitionError(member.status, "expired");
  }
  return touch(member, { status: "expired" });
}

/** Whether the member is active (may borrow or reserve). */
export const isMemberActive = (member: LibraryMember): boolean => member.status === "active";
