import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { ParticipantType } from "./attendance-record";
import { EmptyLeaveFieldError, InvalidLeaveRangeError, LeaveStateError } from "./errors";
import type { LeaveStatus, LeaveType, SupportingDocument } from "./leave-type";

/**
 * A leave request for a participant (a student or staff member) over a date range. Leave
 * integrates with attendance calculations rather than replacing attendance: an **approved**
 * leave excuses an absence on the covered dates (via the policy engine), it never overrides
 * an actual presence. Follows a requested → approved | rejected | cancelled workflow. Its
 * `fromDate`, `toDate` and `status` structurally satisfy the engines' leave view.
 */
export interface Leave {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly personId: Uuid;
  readonly holderType: ParticipantType;
  readonly leaveType: LeaveType;
  readonly fromDate: string;
  readonly toDate: string;
  readonly reason: string;
  readonly supportingDocuments: readonly SupportingDocument[];
  readonly status: LeaveStatus;
  readonly reviewedBy: Uuid | null;
  readonly reviewedAt: ISODateString | null;
  readonly decisionNote: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateLeaveParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly personId: Uuid;
  readonly holderType: ParticipantType;
  readonly leaveType: LeaveType;
  readonly fromDate: string;
  readonly toDate: string;
  readonly reason: string;
  readonly supportingDocuments?: readonly SupportingDocument[];
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyLeaveFieldError(field);
  }
  return trimmed;
};

const touch = (leave: Leave, patch: Partial<Leave>): Leave => ({
  ...leave,
  ...patch,
  updatedAt: nowIso(),
});

/** Create a new requested leave, validating the reason and that the range is well-formed. */
export function createLeave(params: CreateLeaveParams): Leave {
  const fromDate = requireText(params.fromDate, "fromDate");
  const toDate = requireText(params.toDate, "toDate");
  if (toDate < fromDate) {
    throw new InvalidLeaveRangeError(fromDate, toDate);
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    personId: params.personId,
    holderType: params.holderType,
    leaveType: params.leaveType,
    fromDate,
    toDate,
    reason: requireText(params.reason, "reason"),
    supportingDocuments: params.supportingDocuments ? [...params.supportingDocuments] : [],
    status: "requested",
    reviewedBy: null,
    reviewedAt: null,
    decisionNote: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Attach a supporting document to a still-pending request. */
export function addSupportingDocument(leave: Leave, document: SupportingDocument): Leave {
  if (leave.status !== "requested") {
    throw new LeaveStateError(leave.id, "requested", leave.status);
  }
  return touch(leave, { supportingDocuments: [...leave.supportingDocuments, document] });
}

const decide = (
  leave: Leave,
  status: LeaveStatus,
  reviewedBy: Uuid,
  decisionNote: string | null,
): Leave => {
  if (leave.status !== "requested") {
    throw new LeaveStateError(leave.id, "requested", leave.status);
  }
  return touch(leave, {
    status,
    reviewedBy,
    reviewedAt: nowIso(),
    decisionNote: decisionNote?.trim() || null,
  });
};

/** Approve a requested leave. */
export const approveLeave = (leave: Leave, reviewedBy: Uuid, note: string | null = null): Leave =>
  decide(leave, "approved", reviewedBy, note);

/** Reject a requested leave. */
export const rejectLeave = (leave: Leave, reviewedBy: Uuid, note: string | null = null): Leave =>
  decide(leave, "rejected", reviewedBy, note);

/** Cancel (withdraw) a leave that has not been rejected. */
export function cancelLeave(leave: Leave): Leave {
  if (leave.status === "rejected" || leave.status === "cancelled") {
    throw new LeaveStateError(leave.id, "requested or approved", leave.status);
  }
  return touch(leave, { status: "cancelled" });
}
