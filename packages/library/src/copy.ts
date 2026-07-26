import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyBarcodeError, InvalidCopyTransitionError } from "./errors";
import type { CopyCondition, CopyStatus } from "./library-value";

/**
 * A physical copy — one holding of a {@link Title} in the collection, tracked by a barcode (unique within
 * the tenant). It carries a shelf location, a condition and an acquisition date. It runs `available ↔
 * on_loan` (issued/returned by the loan service) and `→ lost` / `withdrawn` (terminal); only an available
 * copy can be issued or withdrawn. The organization is derived from the title.
 */
export interface Copy {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly titleId: Uuid;
  readonly barcode: string;
  readonly location: string | null;
  readonly condition: CopyCondition;
  readonly acquiredOn: string | null;
  readonly status: CopyStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface AccessionCopyParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly titleId: Uuid;
  readonly barcode: string;
  readonly condition?: CopyCondition;
  readonly location?: string | null;
  readonly acquiredOn?: string | null;
}

/** Accession a copy into the collection (status `available`). A non-empty barcode is required. */
export function accessionCopy(params: AccessionCopyParams): Copy {
  const barcode = params.barcode.trim();
  if (barcode.length === 0) {
    throw new EmptyBarcodeError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    titleId: params.titleId,
    barcode,
    location: params.location?.trim() || null,
    condition: params.condition ?? "good",
    acquiredOn: params.acquiredOn?.trim() || null,
    status: "available",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (copy: Copy, patch: Partial<Copy>): Copy => ({
  ...copy,
  ...patch,
  updatedAt: nowIso(),
});

/** Set (or clear) the copy's shelf location. */
export const setCopyLocation = (copy: Copy, location: string | null): Copy =>
  touch(copy, { location: location?.trim() || null });

/** Set the copy's physical condition. */
export const setCopyCondition = (copy: Copy, condition: CopyCondition): Copy =>
  touch(copy, { condition });

/** Issue an available copy on loan (→ `on_loan`). Driven by the loan service. */
export function issueCopy(copy: Copy): Copy {
  if (copy.status !== "available") {
    throw new InvalidCopyTransitionError(copy.status, "on_loan");
  }
  return touch(copy, { status: "on_loan" });
}

/** Return an on-loan copy to the shelf (→ `available`). Driven by the loan service. */
export function returnCopy(copy: Copy): Copy {
  if (copy.status !== "on_loan") {
    throw new InvalidCopyTransitionError(copy.status, "available");
  }
  return touch(copy, { status: "available" });
}

/** Mark a copy lost (→ `lost`, terminal). An available or on-loan copy can be lost. */
export function markCopyLost(copy: Copy): Copy {
  if (copy.status !== "available" && copy.status !== "on_loan") {
    throw new InvalidCopyTransitionError(copy.status, "lost");
  }
  return touch(copy, { status: "lost" });
}

/** Withdraw an available copy from the collection (→ `withdrawn`, terminal). */
export function withdrawCopy(copy: Copy): Copy {
  if (copy.status !== "available") {
    throw new InvalidCopyTransitionError(copy.status, "withdrawn");
  }
  return touch(copy, { status: "withdrawn" });
}

/** Whether the copy is available to be issued. */
export const isCopyAvailable = (copy: Copy): boolean => copy.status === "available";

/** Whether the copy is currently on loan. */
export const isCopyOnLoan = (copy: Copy): boolean => copy.status === "on_loan";
