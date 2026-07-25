import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { NegativeEntitlementError } from "./errors";
import type { LeaveType } from "./workforce-value";

/**
 * A leave entitlement — the policy grant of how many days of a given {@link LeaveType} an
 * {@link Employee} is entitled to in a period (for example 20 annual days for "2026"). It is the
 * "entitled" side of the pure leave-ledger; leave requests draw it down. An employee holds at most
 * one entitlement per leave type per period.
 */
export interface LeaveEntitlement {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly leaveType: LeaveType;
  readonly period: string;
  readonly entitledDays: number;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface GrantEntitlementParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly leaveType: LeaveType;
  readonly period: string;
  readonly entitledDays: number;
}

const assertNonNegative = (entitledDays: number): void => {
  if (!Number.isFinite(entitledDays) || entitledDays < 0) {
    throw new NegativeEntitlementError(entitledDays);
  }
};

/** Grant a leave entitlement. The day count must be zero or positive. */
export function grantEntitlement(params: GrantEntitlementParams): LeaveEntitlement {
  assertNonNegative(params.entitledDays);
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    employeeId: params.employeeId,
    leaveType: params.leaveType,
    period: params.period,
    entitledDays: params.entitledDays,
    createdAt: now,
    updatedAt: now,
  };
}

/** Revise an entitlement's day count (zero or positive). */
export function setEntitledDays(
  entitlement: LeaveEntitlement,
  entitledDays: number,
): LeaveEntitlement {
  assertNonNegative(entitledDays);
  return { ...entitlement, entitledDays, updatedAt: nowIso() };
}
