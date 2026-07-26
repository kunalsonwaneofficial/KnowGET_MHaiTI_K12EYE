import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { CredentialHolderType, CredentialStatus } from "./campus-security-value";
import { EmptyCredentialNumberError, InvalidCredentialTransitionError } from "./errors";

/**
 * An access credential — a badge/card/fob issued to a holder (an Employee P2-D12, a Person P2-D01-M02, or a
 * Visitor) that grants access to a set of zones. It carries a credential number (unique per tenant), the
 * holder, the granted zone ids, an issue date and an optional expiry. It runs `active ↔ suspended` (a
 * temporary hold) and `→ revoked` (a terminal end). The access engine reads its status, granted zones and
 * expiry to decide entry; grants are editable until the credential is revoked.
 */
export interface AccessCredential {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly credentialNumber: string;
  readonly holderType: CredentialHolderType;
  readonly holderId: Uuid;
  readonly grantedZoneIds: readonly Uuid[];
  readonly issuedOn: string;
  readonly expiresOn: string | null;
  readonly status: CredentialStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface IssueCredentialParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly credentialNumber: string;
  readonly holderType: CredentialHolderType;
  readonly holderId: Uuid;
  readonly grantedZoneIds?: readonly Uuid[];
  readonly issuedOn: string;
  readonly expiresOn?: string | null;
}

/** De-duplicate a list of zone ids, preserving first-seen order. */
const dedupe = (ids: readonly Uuid[]): Uuid[] => [...new Set(ids)];

/** Issue an access credential (status `active`). Credential number required; granted zones de-duplicated. */
export function issueCredential(params: IssueCredentialParams): AccessCredential {
  const credentialNumber = params.credentialNumber.trim();
  if (credentialNumber.length === 0) {
    throw new EmptyCredentialNumberError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    credentialNumber,
    holderType: params.holderType,
    holderId: params.holderId,
    grantedZoneIds: dedupe(params.grantedZoneIds ?? []),
    issuedOn: params.issuedOn,
    expiresOn: params.expiresOn ?? null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  credential: AccessCredential,
  patch: Partial<AccessCredential>,
): AccessCredential => ({
  ...credential,
  ...patch,
  updatedAt: nowIso(),
});

/** Grant the credential access to a zone (idempotent); not allowed once revoked (terminal). */
export function grantCredentialZone(credential: AccessCredential, zoneId: Uuid): AccessCredential {
  if (credential.status === "revoked") {
    throw new InvalidCredentialTransitionError(credential.status, "zone-granted");
  }
  if (credential.grantedZoneIds.includes(zoneId)) {
    return credential;
  }
  return touch(credential, { grantedZoneIds: [...credential.grantedZoneIds, zoneId] });
}

/** Revoke the credential's access to a zone (idempotent); not allowed once revoked (terminal). */
export function revokeCredentialZone(credential: AccessCredential, zoneId: Uuid): AccessCredential {
  if (credential.status === "revoked") {
    throw new InvalidCredentialTransitionError(credential.status, "zone-revoked");
  }
  if (!credential.grantedZoneIds.includes(zoneId)) {
    return credential;
  }
  return touch(credential, {
    grantedZoneIds: credential.grantedZoneIds.filter((id) => id !== zoneId),
  });
}

/** Set (or clear) the credential's expiry date; not allowed once revoked. */
export function setCredentialExpiry(
  credential: AccessCredential,
  expiresOn: string | null,
): AccessCredential {
  if (credential.status === "revoked") {
    throw new InvalidCredentialTransitionError(credential.status, "expiry-set");
  }
  return touch(credential, { expiresOn });
}

/** Suspend an active credential (→ `suspended`, a temporary hold). */
export function suspendCredential(credential: AccessCredential): AccessCredential {
  if (credential.status !== "active") {
    throw new InvalidCredentialTransitionError(credential.status, "suspended");
  }
  return touch(credential, { status: "suspended" });
}

/** Reinstate a suspended credential (→ `active`). */
export function reinstateCredential(credential: AccessCredential): AccessCredential {
  if (credential.status !== "suspended") {
    throw new InvalidCredentialTransitionError(credential.status, "active");
  }
  return touch(credential, { status: "active" });
}

/** Revoke a credential (→ `revoked`, terminal). */
export function revokeCredential(credential: AccessCredential): AccessCredential {
  if (credential.status === "revoked") {
    throw new InvalidCredentialTransitionError(credential.status, "revoked");
  }
  return touch(credential, { status: "revoked" });
}

/** Whether the credential is active. */
export const isCredentialActive = (credential: AccessCredential): boolean =>
  credential.status === "active";
