import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { InvalidLeaveDaysError, InvalidLeaveTransitionError } from "./errors";
import type { LeaveStatus, LeaveType } from "./workforce-value";

/**
 * A leave request — an {@link Employee}'s application for a number of days of a given
 * {@link LeaveType} in a period. It follows the lifecycle `requested → approved | rejected |
 * cancelled`; only an **approved** request draws down the leave balance (the pure leave-ledger
 * counts approved as taken and requested as pending, and ignores rejected/cancelled).
 */
export interface LeaveRequest {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly leaveType: LeaveType;
  readonly period: string;
  readonly days: number;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly reason: string | null;
  readonly status: LeaveStatus;
  readonly decidedBy: Uuid | null;
  readonly decidedAt: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RequestLeaveParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly leaveType: LeaveType;
  readonly days: number;
  readonly startDate: string;
  readonly period?: string;
  readonly endDate?: string | null;
  readonly reason?: string | null;
}

/** Submit a leave request (status `requested`). Days must be positive. */
export function requestLeave(params: RequestLeaveParams): LeaveRequest {
  if (!Number.isFinite(params.days) || params.days <= 0) {
    throw new InvalidLeaveDaysError(params.days);
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    employeeId: params.employeeId,
    leaveType: params.leaveType,
    period: params.period ?? params.startDate.slice(0, 4),
    days: params.days,
    startDate: params.startDate,
    endDate: params.endDate ?? null,
    reason: params.reason?.trim() || null,
    status: "requested",
    decidedBy: null,
    decidedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const decide = (
  request: LeaveRequest,
  to: Extract<LeaveStatus, "approved" | "rejected" | "cancelled">,
  allowed: readonly LeaveStatus[],
  decidedBy?: Uuid | null,
): LeaveRequest => {
  if (!allowed.includes(request.status)) {
    throw new InvalidLeaveTransitionError(request.status, to);
  }
  return {
    ...request,
    status: to,
    decidedBy: decidedBy ?? request.decidedBy,
    decidedAt: nowIso(),
    updatedAt: nowIso(),
  };
};

/** Approve a pending leave request (it now draws down the balance). */
export const approveLeave = (request: LeaveRequest, decidedBy?: Uuid | null): LeaveRequest =>
  decide(request, "approved", ["requested"], decidedBy);

/** Reject a pending leave request. */
export const rejectLeave = (request: LeaveRequest, decidedBy?: Uuid | null): LeaveRequest =>
  decide(request, "rejected", ["requested"], decidedBy);

/** Cancel a leave request that is still pending or already approved (but not yet past). */
export const cancelLeave = (request: LeaveRequest, decidedBy?: Uuid | null): LeaveRequest =>
  decide(request, "cancelled", ["requested", "approved"], decidedBy);

/** Whether the request currently draws down the leave balance. */
export const isLeaveApproved = (request: LeaveRequest): boolean => request.status === "approved";
