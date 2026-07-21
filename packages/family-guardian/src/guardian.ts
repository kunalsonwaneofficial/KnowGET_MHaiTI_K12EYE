import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyContactValueError,
  GuardianArchivedError,
  GuardianContactNotFoundError,
  InvalidGuardianTransitionError,
  InvalidVerificationTransitionError,
} from "./errors";
import type { GuardianContact } from "./guardian-contact";
import type { GuardianStatus } from "./guardian-status";
import type { LegalAuthorityType } from "./legal-authority";
import type { VerificationStatus } from "./verification-status";

/**
 * A legal or designated guardian. Identity is a {@link Person} (`personId`) — never
 * duplicated — carrying the basis of legal authority, an independent identity
 * verification standing, reachable contacts, an availability note and the guardian
 * lifecycle status. One guardian may relate to many students (through
 * {@link StudentGuardianRelationship}); this record holds no student reference.
 */
export interface Guardian {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly personId: Uuid;
  readonly legalAuthority: LegalAuthorityType;
  readonly verification: VerificationStatus;
  readonly verifiedOn: string | null;
  readonly contacts: readonly GuardianContact[];
  readonly availabilityNote: string | null;
  readonly status: GuardianStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RegisterGuardianParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly personId: Uuid;
  readonly legalAuthority?: LegalAuthorityType;
  readonly contacts?: readonly GuardianContact[];
  readonly availabilityNote?: string | null;
}

/** Normalize a contact: trim its value and require it to be non-empty. */
export function normalizeContact(contact: GuardianContact): GuardianContact {
  const value = contact.value.trim();
  if (value.length === 0) {
    throw new EmptyContactValueError();
  }
  return { channel: contact.channel, value, isPrimary: contact.isPrimary };
}

/** Coerce a list of contacts so that at most one (the first so flagged) is primary. */
function singlePrimary(contacts: readonly GuardianContact[]): readonly GuardianContact[] {
  let primaryTaken = false;
  return contacts.map((c) => {
    if (c.isPrimary && !primaryTaken) {
      primaryTaken = true;
      return c;
    }
    return c.isPrimary ? { ...c, isPrimary: false } : c;
  });
}

/** Register a new guardian (status `pending`, verification `unverified`). */
export function registerGuardian(params: RegisterGuardianParams): Guardian {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    personId: params.personId,
    legalAuthority: params.legalAuthority ?? "none",
    verification: "unverified",
    verifiedOn: null,
    contacts: singlePrimary((params.contacts ?? []).map(normalizeContact)),
    availabilityNote: params.availabilityNote?.trim() || null,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (guardian: Guardian, patch: Partial<Guardian>): Guardian => ({
  ...guardian,
  ...patch,
  updatedAt: nowIso(),
});

/** Guard: an archived guardian can no longer be modified. */
function requireNotArchived(guardian: Guardian): void {
  if (guardian.status === "archived") {
    throw new GuardianArchivedError(guardian.id);
  }
}

const requireStatus = (
  guardian: Guardian,
  allowed: readonly GuardianStatus[],
  to: string,
): void => {
  if (!allowed.includes(guardian.status)) {
    throw new InvalidGuardianTransitionError(guardian.status, to);
  }
};

/** Submit the guardian's identity for verification. */
export function submitForVerification(guardian: Guardian): Guardian {
  requireNotArchived(guardian);
  if (guardian.verification !== "unverified" && guardian.verification !== "rejected") {
    throw new InvalidVerificationTransitionError(guardian.verification, "pending");
  }
  return touch(guardian, { verification: "pending" });
}

/** Verify the guardian's identity; a pending guardian is thereby activated. */
export function verifyGuardian(guardian: Guardian, verifiedOn?: string | null): Guardian {
  requireNotArchived(guardian);
  if (guardian.verification === "verified") {
    throw new InvalidVerificationTransitionError(guardian.verification, "verified");
  }
  return touch(guardian, {
    verification: "verified",
    verifiedOn: verifiedOn ?? nowIso().slice(0, 10),
    status: guardian.status === "pending" ? "active" : guardian.status,
  });
}

/** Reject the guardian's identity verification. */
export function rejectVerification(guardian: Guardian): Guardian {
  requireNotArchived(guardian);
  if (guardian.verification === "verified" || guardian.verification === "rejected") {
    throw new InvalidVerificationTransitionError(guardian.verification, "rejected");
  }
  return touch(guardian, { verification: "rejected" });
}

/** Activate the guardian (from pending or suspended). */
export function activateGuardian(guardian: Guardian): Guardian {
  requireStatus(guardian, ["pending", "suspended"], "active");
  return touch(guardian, { status: "active" });
}

/** Suspend an active guardian. */
export function suspendGuardian(guardian: Guardian): Guardian {
  requireStatus(guardian, ["active"], "suspended");
  return touch(guardian, { status: "suspended" });
}

/** Archive the guardian (terminal). */
export function archiveGuardian(guardian: Guardian): Guardian {
  requireNotArchived(guardian);
  return touch(guardian, { status: "archived" });
}

/** Update the basis of the guardian's legal authority. */
export function updateLegalAuthority(
  guardian: Guardian,
  legalAuthority: LegalAuthorityType,
): Guardian {
  requireNotArchived(guardian);
  return touch(guardian, { legalAuthority });
}

/** Whether the guardian currently holds legal authority (anything other than `none`). */
export const hasLegalAuthority = (guardian: Guardian): boolean =>
  guardian.legalAuthority !== "none";

/** Add or replace a contact by value; a new primary demotes the others. */
export function putContact(guardian: Guardian, contact: GuardianContact): Guardian {
  requireNotArchived(guardian);
  const normalized = normalizeContact(contact);
  const exists = guardian.contacts.some((c) => c.value === normalized.value);
  const next = exists
    ? guardian.contacts.map((c) => (c.value === normalized.value ? normalized : c))
    : [...guardian.contacts, normalized];
  const adjusted = normalized.isPrimary
    ? next.map((c) => (c.value === normalized.value ? c : { ...c, isPrimary: false }))
    : next;
  return touch(guardian, { contacts: singlePrimary(adjusted) });
}

/** Remove a contact by value. */
export function removeContact(guardian: Guardian, value: string): Guardian {
  requireNotArchived(guardian);
  const target = value.trim();
  if (!guardian.contacts.some((c) => c.value === target)) {
    throw new GuardianContactNotFoundError(target);
  }
  return touch(guardian, { contacts: guardian.contacts.filter((c) => c.value !== target) });
}

/** Set the guardian's availability note. */
export function setAvailability(guardian: Guardian, note: string | null): Guardian {
  requireNotArchived(guardian);
  return touch(guardian, { availabilityNote: note?.trim() || null });
}
