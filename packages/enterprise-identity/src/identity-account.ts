import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  CannotModifyIdentityAccountError,
  DuplicateIdentifierError,
  InvalidIdentityStatusTransitionError,
} from "./errors";
import { hasIdentifier, type LoginIdentifier, sameIdentifier } from "./identifier";

/**
 * Lifecycle of an identity account.
 * - `pending`   — provisioned but not yet usable for login.
 * - `active`    — usable.
 * - `suspended` — temporarily barred (reversible by an administrator).
 * - `locked`    — barred by failed-login lockout (reversible by clearing attempts).
 * - `disabled`  — administratively barred.
 * - `archived`  — terminal.
 */
export type IdentityStatus =
  "pending" | "active" | "suspended" | "locked" | "disabled" | "archived";

/**
 * A tenant-scoped login account for a {@link https://en.wikipedia.org/wiki/Principal_(computer_security) principal}.
 * It links a {@link Person} (the human, by `personId`) to the identifiers and
 * credential they authenticate with, plus the status and lockout counters the
 * authentication engine reads and writes. Persona-agnostic: a person may have
 * zero, one, or several accounts.
 */
export interface IdentityAccount {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  /** The person (human) this login belongs to. */
  readonly personId: Uuid;
  readonly identifiers: readonly LoginIdentifier[];
  readonly credentialHash: string | null;
  readonly status: IdentityStatus;
  readonly failedLoginAttempts: number;
  readonly lockedUntil: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface ProvisionIdentityAccountParams {
  readonly tenantId: TenantId;
  readonly personId: Uuid;
  readonly identifiers: readonly LoginIdentifier[];
  /** A pre-hashed credential (hashing happens at the application edge). */
  readonly credentialHash?: string | null;
}

/** Reject a collection that is empty or contains normalized-duplicate identifiers. */
function assertIdentifierSet(identifiers: readonly LoginIdentifier[]): void {
  if (identifiers.length === 0) {
    throw new CannotModifyIdentityAccountError("at least one identifier is required");
  }
  for (let i = 0; i < identifiers.length; i += 1) {
    for (let j = i + 1; j < identifiers.length; j += 1) {
      const a = identifiers[i];
      const b = identifiers[j];
      if (a && b && sameIdentifier(a, b)) {
        throw new DuplicateIdentifierError(b.type, b.value);
      }
    }
  }
}

/** Provision a new, `pending` identity account for a person. */
export function provisionIdentityAccount(params: ProvisionIdentityAccountParams): IdentityAccount {
  assertIdentifierSet(params.identifiers);
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    personId: params.personId,
    identifiers: [...params.identifiers],
    credentialHash: params.credentialHash ?? null,
    status: "pending",
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (account: IdentityAccount, patch: Partial<IdentityAccount>): IdentityAccount => ({
  ...account,
  ...patch,
  updatedAt: nowIso(),
});

/**
 * Administrative status transitions. `locked` is never entered administratively
 * (only via {@link lockAccount}); it is left as an allowed *source* so a locked
 * account can still be activated (unlocked), disabled or archived.
 */
const STATUS_TRANSITIONS: Readonly<Record<IdentityStatus, readonly IdentityStatus[]>> = {
  pending: ["active", "disabled", "archived"],
  active: ["suspended", "disabled", "archived"],
  suspended: ["active", "disabled", "archived"],
  locked: ["active", "disabled", "archived"],
  disabled: ["active", "archived"],
  archived: [],
};

/** Apply an administrative status transition, rejecting illegal moves. */
export function transitionAccountStatus(
  account: IdentityAccount,
  to: IdentityStatus,
): IdentityAccount {
  if (to === "locked" || !STATUS_TRANSITIONS[account.status].includes(to)) {
    throw new InvalidIdentityStatusTransitionError(account.status, to);
  }
  // Activating a previously-locked account also clears its lockout counters.
  if (to === "active" && account.status === "locked") {
    return touch(account, { status: "active", failedLoginAttempts: 0, lockedUntil: null });
  }
  return touch(account, { status: to });
}

export const activateAccount = (account: IdentityAccount): IdentityAccount =>
  transitionAccountStatus(account, "active");

export const suspendAccount = (account: IdentityAccount): IdentityAccount =>
  transitionAccountStatus(account, "suspended");

export const disableAccount = (account: IdentityAccount): IdentityAccount =>
  transitionAccountStatus(account, "disabled");

export const archiveAccount = (account: IdentityAccount): IdentityAccount =>
  transitionAccountStatus(account, "archived");

/** Set the (pre-hashed) credential. */
export const changeCredentialHash = (
  account: IdentityAccount,
  credentialHash: string,
): IdentityAccount => touch(account, { credentialHash });

/** Add an identifier, rejecting a normalized duplicate already on the account. */
export function addAccountIdentifier(
  account: IdentityAccount,
  identifier: LoginIdentifier,
): IdentityAccount {
  if (hasIdentifier(account.identifiers, identifier)) {
    throw new DuplicateIdentifierError(identifier.type, identifier.value);
  }
  return touch(account, { identifiers: [...account.identifiers, identifier] });
}

/** Remove an identifier (by normalized match); the last identifier cannot be removed. */
export function removeAccountIdentifier(
  account: IdentityAccount,
  identifier: LoginIdentifier,
): IdentityAccount {
  if (!hasIdentifier(account.identifiers, identifier)) {
    return account;
  }
  if (account.identifiers.length === 1) {
    throw new CannotModifyIdentityAccountError("an account must keep at least one identifier");
  }
  return touch(account, {
    identifiers: account.identifiers.filter((existing) => !sameIdentifier(existing, identifier)),
  });
}

/** Record a failed authentication attempt (auth engine writes this back). */
export const recordFailedAttempt = (account: IdentityAccount): IdentityAccount =>
  touch(account, { failedLoginAttempts: account.failedLoginAttempts + 1 });

/** Lock the account until `until` (failed-login lockout). */
export const lockAccount = (account: IdentityAccount, until: ISODateString): IdentityAccount =>
  touch(account, { status: "locked", lockedUntil: until });

/** Clear lockout counters; a locked account returns to `active`. */
export const clearFailedAttempts = (account: IdentityAccount): IdentityAccount =>
  touch(account, {
    failedLoginAttempts: 0,
    lockedUntil: null,
    status: account.status === "locked" ? "active" : account.status,
  });

/** True when the account is currently locked out (as of `now`). */
export const isLockedOut = (account: IdentityAccount, now: ISODateString): boolean =>
  account.status === "locked" && account.lockedUntil !== null && account.lockedUntil > now;
