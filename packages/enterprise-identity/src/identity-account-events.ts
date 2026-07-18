import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { IdentityAccount, IdentityStatus } from "./identity-account";
import type { LoginIdentifierType } from "./identifier";

export const IDENTITY_ACCOUNT_PROVISIONED = "identity_account.provisioned";
export const IDENTITY_ACCOUNT_ACTIVATED = "identity_account.activated";
export const IDENTITY_ACCOUNT_STATUS_CHANGED = "identity_account.status_changed";
export const IDENTITY_ACCOUNT_IDENTIFIER_ADDED = "identity_account.identifier_added";
export const IDENTITY_ACCOUNT_IDENTIFIER_REMOVED = "identity_account.identifier_removed";
export const IDENTITY_ACCOUNT_CREDENTIAL_CHANGED = "identity_account.credential_changed";
export const IDENTITY_ACCOUNT_LOCKED = "identity_account.locked";

export interface IdentityAccountProvisionedPayload {
  readonly accountId: Uuid;
  readonly personId: Uuid;
}
export interface IdentityAccountStatusChangedPayload {
  readonly accountId: Uuid;
  readonly from: IdentityStatus;
  readonly to: IdentityStatus;
}
export interface IdentityAccountIdentifierPayload {
  readonly accountId: Uuid;
  readonly identifierType: LoginIdentifierType;
}
export interface IdentityAccountLockedPayload {
  readonly accountId: Uuid;
  readonly until: string;
}
export interface IdentityAccountIdPayload {
  readonly accountId: Uuid;
}

export type IdentityAccountProvisionedEvent = DomainEvent<
  typeof IDENTITY_ACCOUNT_PROVISIONED,
  IdentityAccountProvisionedPayload
>;

export const identityAccountProvisioned = (
  account: IdentityAccount,
): IdentityAccountProvisionedEvent =>
  createEvent(
    IDENTITY_ACCOUNT_PROVISIONED,
    { accountId: account.id, personId: account.personId },
    { tenantId: account.tenantId },
  );

export const identityAccountActivated = (
  account: IdentityAccount,
): DomainEvent<typeof IDENTITY_ACCOUNT_ACTIVATED, IdentityAccountIdPayload> =>
  createEvent(
    IDENTITY_ACCOUNT_ACTIVATED,
    { accountId: account.id },
    { tenantId: account.tenantId },
  );

export const identityAccountStatusChanged = (
  account: IdentityAccount,
  from: IdentityStatus,
): DomainEvent<typeof IDENTITY_ACCOUNT_STATUS_CHANGED, IdentityAccountStatusChangedPayload> =>
  createEvent(
    IDENTITY_ACCOUNT_STATUS_CHANGED,
    { accountId: account.id, from, to: account.status },
    { tenantId: account.tenantId },
  );

export const identityAccountIdentifierAdded = (
  account: IdentityAccount,
  identifierType: LoginIdentifierType,
): DomainEvent<typeof IDENTITY_ACCOUNT_IDENTIFIER_ADDED, IdentityAccountIdentifierPayload> =>
  createEvent(
    IDENTITY_ACCOUNT_IDENTIFIER_ADDED,
    { accountId: account.id, identifierType },
    { tenantId: account.tenantId },
  );

export const identityAccountIdentifierRemoved = (
  account: IdentityAccount,
  identifierType: LoginIdentifierType,
): DomainEvent<typeof IDENTITY_ACCOUNT_IDENTIFIER_REMOVED, IdentityAccountIdentifierPayload> =>
  createEvent(
    IDENTITY_ACCOUNT_IDENTIFIER_REMOVED,
    { accountId: account.id, identifierType },
    { tenantId: account.tenantId },
  );

export const identityAccountCredentialChanged = (
  account: IdentityAccount,
): DomainEvent<typeof IDENTITY_ACCOUNT_CREDENTIAL_CHANGED, IdentityAccountIdPayload> =>
  createEvent(
    IDENTITY_ACCOUNT_CREDENTIAL_CHANGED,
    { accountId: account.id },
    { tenantId: account.tenantId },
  );

export const identityAccountLocked = (
  account: IdentityAccount,
  until: string,
): DomainEvent<typeof IDENTITY_ACCOUNT_LOCKED, IdentityAccountLockedPayload> =>
  createEvent(
    IDENTITY_ACCOUNT_LOCKED,
    { accountId: account.id, until },
    { tenantId: account.tenantId },
  );
