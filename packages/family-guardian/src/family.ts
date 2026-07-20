import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { CommunicationChannel } from "./communication-channel";
import {
  AddressNotFoundError,
  DuplicateHouseholdMemberError,
  EmptyFamilyNameError,
  EmptyFamilyNumberError,
  HouseholdMemberNotFoundError,
  InactiveFamilyError,
  IncompleteAddressError,
} from "./errors";
import type { FamilyAddress } from "./family-address";
import type { FamilyStatus } from "./family-status";
import type { HouseholdMember, HouseholdRole } from "./household-member";

/**
 * A family unit — a dynamic institutional stakeholder, not an attribute of a student
 * record. It carries a family number, a household name, its members (each a
 * {@link Person}), postal addresses, a preferred-communication default and a single
 * primary contact, and moves through the {@link FamilyStatus} lifecycle. It is
 * deliberately **independent of Student**: learners relate to families only through
 * guardians and student–guardian relationships, never by a reference held here.
 */
export interface Family {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly familyNumber: string;
  readonly name: string;
  readonly members: readonly HouseholdMember[];
  readonly primaryContactPersonId: Uuid | null;
  readonly addresses: readonly FamilyAddress[];
  readonly preferredLanguage: string | null;
  readonly preferredChannel: CommunicationChannel | null;
  readonly status: FamilyStatus;
  readonly mergedIntoFamilyId: Uuid | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RegisterFamilyParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly familyNumber: string;
  readonly name: string;
  readonly members?: readonly HouseholdMember[];
  readonly addresses?: readonly FamilyAddress[];
  readonly preferredLanguage?: string | null;
  readonly preferredChannel?: CommunicationChannel | null;
}

/** Normalize an address: trim its fields and require a first line and city. */
export function normalizeAddress(address: FamilyAddress): FamilyAddress {
  const line1 = address.line1.trim();
  const city = address.city.trim();
  if (line1.length === 0 || city.length === 0) {
    throw new IncompleteAddressError();
  }
  return {
    label: address.label.trim() || "home",
    line1,
    line2: address.line2?.trim() || null,
    city,
    region: address.region?.trim() || null,
    postalCode: address.postalCode?.trim() || null,
    country: address.country.trim() || "",
    isPrimary: address.isPrimary,
  };
}

/** Coerce a list of addresses so that at most one (the first so flagged) is primary. */
function singlePrimary(addresses: readonly FamilyAddress[]): readonly FamilyAddress[] {
  let primaryTaken = false;
  return addresses.map((a) => {
    if (a.isPrimary && !primaryTaken) {
      primaryTaken = true;
      return a;
    }
    return a.isPrimary ? { ...a, isPrimary: false } : a;
  });
}

/** Dedupe members by person, rejecting a repeated person. */
function normalizeMembers(members: readonly HouseholdMember[]): readonly HouseholdMember[] {
  const seen = new Set<string>();
  for (const member of members) {
    if (seen.has(member.personId)) {
      throw new DuplicateHouseholdMemberError(member.personId);
    }
    seen.add(member.personId);
  }
  return members.map((m) => ({ personId: m.personId, role: m.role }));
}

/** Register a new, active family unit. */
export function registerFamily(params: RegisterFamilyParams): Family {
  const familyNumber = params.familyNumber.trim();
  if (familyNumber.length === 0) {
    throw new EmptyFamilyNumberError();
  }
  const name = params.name.trim();
  if (name.length === 0) {
    throw new EmptyFamilyNameError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    familyNumber,
    name,
    members: normalizeMembers(params.members ?? []),
    primaryContactPersonId: null,
    addresses: singlePrimary((params.addresses ?? []).map(normalizeAddress)),
    preferredLanguage: params.preferredLanguage?.trim() || null,
    preferredChannel: params.preferredChannel ?? null,
    status: "active",
    mergedIntoFamilyId: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (family: Family, patch: Partial<Family>): Family => ({
  ...family,
  ...patch,
  updatedAt: nowIso(),
});

/** Guard: the family must be active to be modified. */
function requireActive(family: Family): void {
  if (family.status !== "active") {
    throw new InactiveFamilyError(family.status);
  }
}

/** Whether the person is currently a member of the household. */
export const hasMember = (family: Family, personId: Uuid): boolean =>
  family.members.some((m) => m.personId === personId);

/** Add a household member (must be active; the person must not already be a member). */
export function addMember(family: Family, member: HouseholdMember): Family {
  requireActive(family);
  if (hasMember(family, member.personId)) {
    throw new DuplicateHouseholdMemberError(member.personId);
  }
  return touch(family, {
    members: [...family.members, { personId: member.personId, role: member.role }],
  });
}

/** Remove a household member; clears the primary contact if it was them. */
export function removeMember(family: Family, personId: Uuid): Family {
  requireActive(family);
  if (!hasMember(family, personId)) {
    throw new HouseholdMemberNotFoundError(personId);
  }
  return touch(family, {
    members: family.members.filter((m) => m.personId !== personId),
    primaryContactPersonId:
      family.primaryContactPersonId === personId ? null : family.primaryContactPersonId,
  });
}

/** Change a member's household role. */
export function setMemberRole(family: Family, personId: Uuid, role: HouseholdRole): Family {
  requireActive(family);
  if (!hasMember(family, personId)) {
    throw new HouseholdMemberNotFoundError(personId);
  }
  return touch(family, {
    members: family.members.map((m) => (m.personId === personId ? { ...m, role } : m)),
  });
}

/** Designate the household's single primary contact (must be a member). */
export function setPrimaryContact(family: Family, personId: Uuid): Family {
  requireActive(family);
  if (!hasMember(family, personId)) {
    throw new HouseholdMemberNotFoundError(personId);
  }
  return touch(family, { primaryContactPersonId: personId });
}

/** Add or replace an address by label; a new primary demotes the others. */
export function putAddress(family: Family, address: FamilyAddress): Family {
  requireActive(family);
  const normalized = normalizeAddress(address);
  const exists = family.addresses.some((a) => a.label === normalized.label);
  const next = exists
    ? family.addresses.map((a) => (a.label === normalized.label ? normalized : a))
    : [...family.addresses, normalized];
  const adjusted = normalized.isPrimary
    ? next.map((a) => (a.label === normalized.label ? a : { ...a, isPrimary: false }))
    : next;
  return touch(family, { addresses: singlePrimary(adjusted) });
}

/** Remove an address by label. */
export function removeAddress(family: Family, label: string): Family {
  requireActive(family);
  const target = label.trim();
  if (!family.addresses.some((a) => a.label === target)) {
    throw new AddressNotFoundError(target);
  }
  return touch(family, { addresses: family.addresses.filter((a) => a.label !== target) });
}

export interface PreferredCommunicationPatch {
  readonly preferredLanguage?: string | null;
  readonly preferredChannel?: CommunicationChannel | null;
}

/** Update the family's preferred-communication defaults. */
export function setPreferredCommunication(
  family: Family,
  patch: PreferredCommunicationPatch,
): Family {
  requireActive(family);
  return touch(family, {
    ...(patch.preferredLanguage !== undefined
      ? { preferredLanguage: patch.preferredLanguage?.trim() || null }
      : {}),
    ...(patch.preferredChannel !== undefined ? { preferredChannel: patch.preferredChannel } : {}),
  });
}

/** Rename the household. */
export function renameFamily(family: Family, name: string): Family {
  requireActive(family);
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new EmptyFamilyNameError();
  }
  return touch(family, { name: trimmed });
}

/** Mark the family as merged into another (terminal). */
export function markMerged(family: Family, intoFamilyId: Uuid): Family {
  requireActive(family);
  return touch(family, { status: "merged", mergedIntoFamilyId: intoFamilyId });
}

/** Mark the family as split into new households (terminal). */
export function markSplit(family: Family): Family {
  requireActive(family);
  return touch(family, { status: "split" });
}

/** Archive the family (terminal); idempotent guard against re-archiving. */
export function archiveFamily(family: Family): Family {
  if (family.status === "archived") {
    throw new InactiveFamilyError(family.status);
  }
  return touch(family, { status: "archived" });
}
