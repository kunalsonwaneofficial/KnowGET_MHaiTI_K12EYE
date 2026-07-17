import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, Uuid } from "@knowget/types";

export type IdentityStatus =
  "pending" | "active" | "suspended" | "locked" | "disabled" | "archived";

export type LoginIdentifierType = "username" | "email" | "mobile";

export interface LoginIdentifier {
  readonly type: LoginIdentifierType;
  readonly value: string;
}

/**
 * A digital identity — the persona-agnostic authentication subject. Business
 * personas (Student, Teacher, …) are layered on in Phase 2; here we manage only
 * identifiers, credentials, status and the lockout counters.
 */
export interface Identity {
  readonly id: Uuid;
  readonly identifiers: readonly LoginIdentifier[];
  readonly credentialHash: string | null;
  readonly status: IdentityStatus;
  readonly failedLoginAttempts: number;
  readonly lockedUntil: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateIdentityParams {
  readonly identifiers: readonly LoginIdentifier[];
  readonly credentialHash?: string | null;
}

export function createIdentity(params: CreateIdentityParams): Identity {
  const now = nowIso();
  return {
    id: newUuid(),
    identifiers: params.identifiers,
    credentialHash: params.credentialHash ?? null,
    status: "pending",
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (identity: Identity, patch: Partial<Identity>): Identity => ({
  ...identity,
  ...patch,
  updatedAt: nowIso(),
});

export const activateIdentity = (identity: Identity): Identity =>
  touch(identity, { status: "active" });

export const suspendIdentity = (identity: Identity): Identity =>
  touch(identity, { status: "suspended" });

export const disableIdentity = (identity: Identity): Identity =>
  touch(identity, { status: "disabled" });

export const lockIdentity = (identity: Identity, until: ISODateString): Identity =>
  touch(identity, { status: "locked", lockedUntil: until });

export const recordFailedAttempt = (identity: Identity): Identity =>
  touch(identity, { failedLoginAttempts: identity.failedLoginAttempts + 1 });

export const clearFailedAttempts = (identity: Identity): Identity =>
  touch(identity, {
    failedLoginAttempts: 0,
    lockedUntil: null,
    status: identity.status === "locked" ? "active" : identity.status,
  });

export const changeCredential = (identity: Identity, credentialHash: string): Identity =>
  touch(identity, { credentialHash });

/** True when the identity is currently locked out (as of `now`). */
export const isLockedOut = (identity: Identity, now: ISODateString): boolean =>
  identity.status === "locked" && identity.lockedUntil !== null && identity.lockedUntil > now;
