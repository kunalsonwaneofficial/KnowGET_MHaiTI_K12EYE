import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyConcessionReasonError,
  InvalidConcessionAmountError,
  InvalidConcessionPercentageError,
  InvalidConcessionTransitionError,
  InvalidCurrencyError,
} from "./errors";
import type { ConcessionStatus, ConcessionType } from "./finance-value";
import { assertSameCurrency, isCurrencyCode, type Money, money, percentageOf } from "./money";

/**
 * A concession — a scholarship or discount that reduces what a student owes. It is either a
 * `percentage` of a base amount or a `fixed` amount in a currency, and runs `requested → approved →
 * revoked` (or `requested → rejected`). Only an approved concession is applied. The money it takes off
 * a given base is computed by the pure {@link concessionAmount}; the aggregate stays descriptive.
 */
export interface Concession {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly feeStructureId: Uuid | null;
  readonly type: ConcessionType;
  readonly percentage: number | null;
  readonly amountMinor: number | null;
  readonly currency: string | null;
  readonly reason: string;
  readonly status: ConcessionStatus;
  readonly reviewNote: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RequestConcessionParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly type: ConcessionType;
  readonly reason: string;
  readonly feeStructureId?: Uuid | null;
  readonly percentage?: number | null;
  readonly amountMinor?: number | null;
  readonly currency?: string | null;
}

/** Request a concession (status `requested`). A percentage or a fixed amount+currency is required. */
export function requestConcession(params: RequestConcessionParams): Concession {
  const reason = params.reason.trim();
  if (reason.length === 0) {
    throw new EmptyConcessionReasonError();
  }
  let percentage: number | null = null;
  let amountMinor: number | null = null;
  let currency: string | null = null;
  if (params.type === "percentage") {
    const pct = params.percentage ?? 0;
    if (!(pct > 0 && pct <= 100)) {
      throw new InvalidConcessionPercentageError(pct);
    }
    percentage = pct;
  } else {
    const amount = params.amountMinor ?? 0;
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new InvalidConcessionAmountError(amount);
    }
    if (!params.currency || !isCurrencyCode(params.currency)) {
      throw new InvalidCurrencyError(params.currency ?? "");
    }
    amountMinor = amount;
    currency = params.currency;
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    studentId: params.studentId,
    feeStructureId: params.feeStructureId ?? null,
    type: params.type,
    percentage,
    amountMinor,
    currency,
    reason,
    status: "requested",
    reviewNote: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (concession: Concession, patch: Partial<Concession>): Concession => ({
  ...concession,
  ...patch,
  updatedAt: nowIso(),
});

/** Approve a requested concession (→ `approved`). */
export function approveConcession(concession: Concession, reviewNote?: string | null): Concession {
  if (concession.status !== "requested") {
    throw new InvalidConcessionTransitionError(concession.status, "approved");
  }
  return touch(concession, { status: "approved", reviewNote: reviewNote?.trim() || null });
}

/** Reject a requested concession (→ `rejected`). */
export function rejectConcession(concession: Concession, reviewNote?: string | null): Concession {
  if (concession.status !== "requested") {
    throw new InvalidConcessionTransitionError(concession.status, "rejected");
  }
  return touch(concession, { status: "rejected", reviewNote: reviewNote?.trim() || null });
}

/** Revoke an approved concession (→ `revoked`). */
export function revokeConcession(concession: Concession, reviewNote?: string | null): Concession {
  if (concession.status !== "approved") {
    throw new InvalidConcessionTransitionError(concession.status, "revoked");
  }
  return touch(concession, { status: "revoked", reviewNote: reviewNote?.trim() || null });
}

/**
 * The money a concession takes off a given base amount — a percentage of the base, or the fixed
 * amount capped at the base (a discount never exceeds what is owed). Pure and exact; a fixed
 * concession must match the base currency. Callers decide whether to apply it (see
 * {@link isConcessionActive}).
 */
export function concessionAmount(concession: Concession, base: Money): Money {
  if (concession.type === "percentage") {
    return percentageOf(base, concession.percentage ?? 0);
  }
  const fixed = money(concession.amountMinor ?? 0, concession.currency ?? base.currency);
  assertSameCurrency(fixed, base);
  return money(Math.min(fixed.amountMinor, base.amountMinor), base.currency);
}

/** Whether the concession is approved (and so should be applied). */
export const isConcessionActive = (concession: Concession): boolean =>
  concession.status === "approved";
