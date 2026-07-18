import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { AuthorityScope } from "./authority-scope";
import {
  InvalidDelegationPeriodError,
  InvalidDelegationTransitionError,
  InvalidMonetaryLimitError,
  SelfDelegationError,
} from "./errors";

export type DelegationStatus = "active" | "revoked";

/**
 * A delegation of authority — a delegator confers an approval power (a scope, with
 * an optional monetary limit) on a delegate, for an effective window. Temporary
 * delegations set `effectiveUntil`; a delegation is revocable, and the grant/revoke
 * events form its audit trail. The set of effective delegations for an organization
 * and scope is the approval matrix.
 */
export interface Delegation {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** The Person delegating the authority (the authority holder). */
  readonly delegatorId: Uuid;
  /** The Person receiving the authority. */
  readonly delegateId: Uuid;
  readonly scope: AuthorityScope;
  readonly description: string | null;
  /** Maximum approval amount (minor currency units); null ⇒ no monetary cap. */
  readonly monetaryLimit: number | null;
  readonly status: DelegationStatus;
  readonly effectiveFrom: string;
  /** End of the effective window; null ⇒ open-ended (else a temporary delegation). */
  readonly effectiveUntil: string | null;
  readonly grantedOn: string;
  readonly revokedOn: string | null;
  readonly revokedReason: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface GrantDelegationParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly delegatorId: Uuid;
  readonly delegateId: Uuid;
  readonly scope: AuthorityScope;
  readonly effectiveFrom: string;
  readonly description?: string | null;
  readonly monetaryLimit?: number | null;
  readonly effectiveUntil?: string | null;
}

/** Grant a new, `active` delegation of authority. */
export function grantDelegation(params: GrantDelegationParams): Delegation {
  if (params.delegatorId === params.delegateId) {
    throw new SelfDelegationError(params.delegatorId);
  }
  const monetaryLimit = params.monetaryLimit ?? null;
  if (monetaryLimit !== null && monetaryLimit < 0) {
    throw new InvalidMonetaryLimitError(monetaryLimit);
  }
  const effectiveUntil = params.effectiveUntil ?? null;
  if (effectiveUntil !== null && effectiveUntil < params.effectiveFrom) {
    throw new InvalidDelegationPeriodError(params.effectiveFrom, effectiveUntil);
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    delegatorId: params.delegatorId,
    delegateId: params.delegateId,
    scope: params.scope,
    description: params.description?.trim() || null,
    monetaryLimit,
    status: "active",
    effectiveFrom: params.effectiveFrom,
    effectiveUntil,
    grantedOn: now.slice(0, 10),
    revokedOn: null,
    revokedReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Revoke an active delegation (recording the reason for the audit trail). */
export function revokeDelegation(
  delegation: Delegation,
  options: { reason?: string | null; revokedOn?: string | null } = {},
): Delegation {
  if (delegation.status !== "active") {
    throw new InvalidDelegationTransitionError(delegation.status, "revoked");
  }
  return {
    ...delegation,
    status: "revoked",
    revokedOn: options.revokedOn ?? nowIso().slice(0, 10),
    revokedReason: options.reason?.trim() || null,
    updatedAt: nowIso(),
  };
}

/** True when the delegation is `active` and `on` falls within its effective window. */
export function isEffectiveOn(delegation: Delegation, on: string): boolean {
  return (
    delegation.status === "active" &&
    delegation.effectiveFrom <= on &&
    (delegation.effectiveUntil === null || on <= delegation.effectiveUntil)
  );
}

/** True when the delegation is time-boxed (has an end date). */
export const isTemporary = (delegation: Delegation): boolean => delegation.effectiveUntil !== null;

/**
 * True when an effective delegation authorizes an amount: no cap, or the amount is
 * within the monetary limit. A non-effective delegation authorizes nothing.
 */
export function authorizesAmount(delegation: Delegation, amount: number, on: string): boolean {
  if (!isEffectiveOn(delegation, on)) {
    return false;
  }
  return delegation.monetaryLimit === null || amount <= delegation.monetaryLimit;
}
