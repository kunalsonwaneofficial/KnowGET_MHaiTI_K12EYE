import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateRequisitionLineKeyError,
  EmptyRequisitionError,
  EmptyRequisitionTitleError,
  InvalidCurrencyError,
  InvalidRequisitionTransitionError,
  RequisitionLineNotFoundError,
  RequisitionNotEditableError,
} from "./errors";
import { isCurrencyCode, type Money, money } from "./money";
import {
  makeRequisitionLine,
  type RequisitionLine,
  type RequisitionLineInput,
} from "./requisition-line";
import type { RequisitionStatus } from "./resource-value";

/**
 * A purchase requisition — an internal request to buy, raised by a staff member. It carries a set of
 * requested lines (item, quantity, estimated unit cost) in one currency and runs `draft → submitted →
 * approved | rejected`. Lines are editable **only while draft** and frozen once submitted; approval
 * (with a review note) authorizes raising a purchase order.
 */
export interface PurchaseRequisition {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly requesterId: Uuid;
  readonly title: string;
  readonly justification: string | null;
  readonly currency: string;
  readonly lines: readonly RequisitionLine[];
  readonly status: RequisitionStatus;
  readonly reviewNote: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface DraftRequisitionParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly requesterId: Uuid;
  readonly title: string;
  readonly currency: string;
  readonly justification?: string | null;
  readonly lines?: readonly RequisitionLineInput[];
}

/** Build the line list, rejecting duplicate keys. */
function buildLines(inputs: readonly RequisitionLineInput[]): RequisitionLine[] {
  const seen = new Set<string>();
  const lines: RequisitionLine[] = [];
  for (const input of inputs) {
    const line = makeRequisitionLine(input);
    if (seen.has(line.key)) {
      throw new DuplicateRequisitionLineKeyError(line.key);
    }
    seen.add(line.key);
    lines.push(line);
  }
  return lines;
}

/** Draft a purchase requisition (status `draft`). Title and a valid currency required. */
export function draftRequisition(params: DraftRequisitionParams): PurchaseRequisition {
  const title = params.title.trim();
  if (title.length === 0) {
    throw new EmptyRequisitionTitleError();
  }
  if (!isCurrencyCode(params.currency)) {
    throw new InvalidCurrencyError(params.currency);
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    requesterId: params.requesterId,
    title,
    justification: params.justification?.trim() || null,
    currency: params.currency,
    lines: buildLines(params.lines ?? []),
    status: "draft",
    reviewNote: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  requisition: PurchaseRequisition,
  patch: Partial<PurchaseRequisition>,
): PurchaseRequisition => ({
  ...requisition,
  ...patch,
  updatedAt: nowIso(),
});

const requireDraft = (requisition: PurchaseRequisition): void => {
  if (requisition.status !== "draft") {
    throw new RequisitionNotEditableError(requisition.id, requisition.status);
  }
};

/** The estimated total (sum of line totals) in minor units. */
export function requisitionTotalMinor(requisition: PurchaseRequisition): number {
  return requisition.lines.reduce(
    (sum, line) => sum + line.quantity * line.estimatedUnitCostMinor,
    0,
  );
}

/** The estimated total as {@link Money}. */
export const requisitionTotal = (requisition: PurchaseRequisition): Money =>
  money(requisitionTotalMinor(requisition), requisition.currency);

/** Set (or clear) the requisition justification. */
export const setRequisitionJustification = (
  requisition: PurchaseRequisition,
  justification: string | null,
): PurchaseRequisition => touch(requisition, { justification: justification?.trim() || null });

/** Add a line to a draft requisition (unique key). */
export function addRequisitionLine(
  requisition: PurchaseRequisition,
  input: RequisitionLineInput,
): PurchaseRequisition {
  requireDraft(requisition);
  const line = makeRequisitionLine(input);
  if (requisition.lines.some((l) => l.key === line.key)) {
    throw new DuplicateRequisitionLineKeyError(line.key);
  }
  return touch(requisition, { lines: [...requisition.lines, line] });
}

/** Remove a line from a draft requisition. */
export function removeRequisitionLine(
  requisition: PurchaseRequisition,
  key: string,
): PurchaseRequisition {
  requireDraft(requisition);
  if (!requisition.lines.some((l) => l.key === key)) {
    throw new RequisitionLineNotFoundError(key);
  }
  return touch(requisition, { lines: requisition.lines.filter((l) => l.key !== key) });
}

/** Submit a draft requisition for approval (→ `submitted`), freezing its lines. Requires a line. */
export function submitRequisition(requisition: PurchaseRequisition): PurchaseRequisition {
  if (requisition.status !== "draft") {
    throw new InvalidRequisitionTransitionError(requisition.status, "submitted");
  }
  if (requisition.lines.length === 0) {
    throw new EmptyRequisitionError();
  }
  return touch(requisition, { status: "submitted" });
}

/** Approve a submitted requisition (→ `approved`), recording a review note. */
export function approveRequisition(
  requisition: PurchaseRequisition,
  reviewNote?: string | null,
): PurchaseRequisition {
  if (requisition.status !== "submitted") {
    throw new InvalidRequisitionTransitionError(requisition.status, "approved");
  }
  return touch(requisition, { status: "approved", reviewNote: reviewNote?.trim() || null });
}

/** Reject a submitted requisition (→ `rejected`), recording a review note. */
export function rejectRequisition(
  requisition: PurchaseRequisition,
  reviewNote?: string | null,
): PurchaseRequisition {
  if (requisition.status !== "submitted") {
    throw new InvalidRequisitionTransitionError(requisition.status, "rejected");
  }
  return touch(requisition, { status: "rejected", reviewNote: reviewNote?.trim() || null });
}

/** Whether the requisition is approved (authorizes raising a purchase order). */
export const isRequisitionApproved = (requisition: PurchaseRequisition): boolean =>
  requisition.status === "approved";
