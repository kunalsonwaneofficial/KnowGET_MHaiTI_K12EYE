import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { InvalidOutpassTransitionError, InvalidOutpassWindowError } from "./errors";
import { OPEN_OUTPASS_STATUSES, type OutpassStatus, type OutpassType } from "./residential-value";

/**
 * An outpass (gate pass) — a resident's authorization to leave the campus and return. It carries the kind
 * of leave, the expected out/return times, and (once granted) the approver and the actual out/return
 * stamps. It runs `requested → approved → checked_out → returned`, or ends `rejected` / `cancelled`. A
 * checked-out outpass whose expected return has passed is **overdue** — a derived, clock-free flag, never
 * stored. The organization and hostel are derived from the resident's active allocation.
 */
export interface Outpass {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly hostelId: Uuid;
  readonly studentId: Uuid;
  readonly type: OutpassType;
  readonly reason: string | null;
  readonly expectedOutAt: string;
  readonly expectedInAt: string;
  readonly actualOutAt: string | null;
  readonly actualInAt: string | null;
  readonly approvedBy: Uuid | null;
  readonly status: OutpassStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RequestOutpassParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly hostelId: Uuid;
  readonly studentId: Uuid;
  readonly type: OutpassType;
  readonly expectedOutAt: string;
  readonly expectedInAt: string;
  readonly reason?: string | null;
}

const requireTime = (value: string, label: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0 || Number.isNaN(new Date(trimmed).getTime())) {
    throw new InvalidOutpassWindowError(`the ${label} must be a valid date/time`);
  }
  return trimmed;
};

function validateWindow(
  expectedOutAt: string,
  expectedInAt: string,
): { expectedOutAt: string; expectedInAt: string } {
  const out = requireTime(expectedOutAt, "expected departure time");
  const back = requireTime(expectedInAt, "expected return time");
  if (back < out) {
    throw new InvalidOutpassWindowError("the expected return cannot be before the departure");
  }
  return { expectedOutAt: out, expectedInAt: back };
}

/** Request an outpass (status `requested`). Valid out/return times required (return ≥ departure). */
export function requestOutpass(params: RequestOutpassParams): Outpass {
  const window = validateWindow(params.expectedOutAt, params.expectedInAt);
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    hostelId: params.hostelId,
    studentId: params.studentId,
    type: params.type,
    reason: params.reason?.trim() || null,
    expectedOutAt: window.expectedOutAt,
    expectedInAt: window.expectedInAt,
    actualOutAt: null,
    actualInAt: null,
    approvedBy: null,
    status: "requested",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (outpass: Outpass, patch: Partial<Outpass>): Outpass => ({
  ...outpass,
  ...patch,
  updatedAt: nowIso(),
});

/** Approve a requested outpass (→ `approved`), recording the approver. */
export function approveOutpass(outpass: Outpass, approvedBy: Uuid): Outpass {
  if (outpass.status !== "requested") {
    throw new InvalidOutpassTransitionError(outpass.status, "approved");
  }
  return touch(outpass, { status: "approved", approvedBy });
}

/** Reject a requested outpass (→ `rejected`, terminal). */
export function rejectOutpass(outpass: Outpass): Outpass {
  if (outpass.status !== "requested") {
    throw new InvalidOutpassTransitionError(outpass.status, "rejected");
  }
  return touch(outpass, { status: "rejected" });
}

/** Check a resident out on an approved outpass (→ `checked_out`), stamping the actual departure. */
export function checkOutOutpass(outpass: Outpass, actualOutAt?: string): Outpass {
  if (outpass.status !== "approved") {
    throw new InvalidOutpassTransitionError(outpass.status, "checked_out");
  }
  const stamp = actualOutAt ? requireTime(actualOutAt, "actual departure time") : nowIso();
  return touch(outpass, { status: "checked_out", actualOutAt: stamp });
}

/** Record a resident's return on a checked-out outpass (→ `returned`), stamping the actual return. */
export function returnOutpass(outpass: Outpass, actualInAt?: string): Outpass {
  if (outpass.status !== "checked_out") {
    throw new InvalidOutpassTransitionError(outpass.status, "returned");
  }
  const stamp = actualInAt ? requireTime(actualInAt, "actual return time") : nowIso();
  return touch(outpass, { status: "returned", actualInAt: stamp });
}

/** Cancel a requested or approved outpass before departure (→ `cancelled`, terminal). */
export function cancelOutpass(outpass: Outpass): Outpass {
  if (outpass.status !== "requested" && outpass.status !== "approved") {
    throw new InvalidOutpassTransitionError(outpass.status, "cancelled");
  }
  return touch(outpass, { status: "cancelled" });
}

/** Whether the outpass is still open (requested/approved/checked_out) — blocks a second open outpass. */
export const isOutpassOpen = (outpass: Outpass): boolean =>
  OPEN_OUTPASS_STATUSES.includes(outpass.status);

/**
 * Whether the outpass is overdue as of a date/time — it is checked out and the expected return has
 * passed. Deterministic (no clock); the caller passes the as-of value.
 */
export const isOutpassOverdue = (outpass: Outpass, asOf: string): boolean =>
  outpass.status === "checked_out" && asOf > outpass.expectedInAt;
