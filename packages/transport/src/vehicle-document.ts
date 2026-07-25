import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyDocumentNumberError, InvalidDocumentDatesError } from "./errors";
import type { ComplianceStatus, DocumentType } from "./transport-value";
import type { DocumentCompliance } from "./transport-view";

/** The default window (in days) before expiry within which a document is flagged `expiring`. */
export const DEFAULT_WARNING_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A statutory vehicle document tracked for compliance — insurance, fitness certificate, permit,
 * pollution certificate or road tax — with its number and issue/expiry dates. Exactly one document of
 * each type per vehicle (renewed in place). Its compliance (`valid` / `expiring` / `expired`) is derived
 * from the expiry date as of a given date, never stored. The organization is derived from the vehicle.
 */
export interface VehicleDocument {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly vehicleId: Uuid;
  readonly type: DocumentType;
  readonly documentNumber: string;
  readonly issuedOn: string;
  readonly expiresOn: string;
  readonly notes: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RecordDocumentParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly vehicleId: Uuid;
  readonly type: DocumentType;
  readonly documentNumber: string;
  readonly issuedOn: string;
  readonly expiresOn: string;
  readonly notes?: string | null;
}

const requireDate = (value: string, label: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0 || Number.isNaN(new Date(trimmed).getTime())) {
    throw new InvalidDocumentDatesError(`the ${label} must be a valid date`);
  }
  return trimmed;
};

function validateDates(
  issuedOn: string,
  expiresOn: string,
): { issuedOn: string; expiresOn: string } {
  const issued = requireDate(issuedOn, "issue date");
  const expires = requireDate(expiresOn, "expiry date");
  if (expires < issued) {
    throw new InvalidDocumentDatesError("the expiry date cannot be before the issue date");
  }
  return { issuedOn: issued, expiresOn: expires };
}

/** Record a vehicle document. Number and valid issue/expiry dates (expiry ≥ issue) required. */
export function recordVehicleDocument(params: RecordDocumentParams): VehicleDocument {
  const documentNumber = params.documentNumber.trim();
  if (documentNumber.length === 0) {
    throw new EmptyDocumentNumberError();
  }
  const dates = validateDates(params.issuedOn, params.expiresOn);
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    vehicleId: params.vehicleId,
    type: params.type,
    documentNumber,
    issuedOn: dates.issuedOn,
    expiresOn: dates.expiresOn,
    notes: params.notes?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (document: VehicleDocument, patch: Partial<VehicleDocument>): VehicleDocument => ({
  ...document,
  ...patch,
  updatedAt: nowIso(),
});

/** Renew a document — a new number and issue/expiry dates. */
export function renewDocument(
  document: VehicleDocument,
  documentNumber: string,
  issuedOn: string,
  expiresOn: string,
): VehicleDocument {
  const trimmed = documentNumber.trim();
  if (trimmed.length === 0) {
    throw new EmptyDocumentNumberError();
  }
  const dates = validateDates(issuedOn, expiresOn);
  return touch(document, {
    documentNumber: trimmed,
    issuedOn: dates.issuedOn,
    expiresOn: dates.expiresOn,
  });
}

/** Set (or clear) the document notes. */
export const setDocumentNotes = (
  document: VehicleDocument,
  notes: string | null,
): VehicleDocument => touch(document, { notes: notes?.trim() || null });

/** Whole days from one date-only value to another (UTC), positive when `toDate` is later. */
export function daysBetween(fromDate: string, toDate: string): number {
  const from = new Date(fromDate).getTime();
  const to = new Date(toDate).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) {
    return 0;
  }
  return Math.round((to - from) / MS_PER_DAY);
}

/**
 * The document's compliance as of a date — `expired` once the expiry has passed, `expiring` within the
 * warning window (default 30 days, inclusive of the expiry day), else `valid`. Deterministic (no clock);
 * the caller passes the as-of date.
 */
export function documentComplianceAsOf(
  document: VehicleDocument,
  asOfDate: string,
  warningDays: number = DEFAULT_WARNING_DAYS,
): DocumentCompliance {
  const daysToExpiry = daysBetween(asOfDate, document.expiresOn);
  let status: ComplianceStatus;
  if (daysToExpiry < 0) {
    status = "expired";
  } else if (daysToExpiry <= warningDays) {
    status = "expiring";
  } else {
    status = "valid";
  }
  return {
    type: document.type,
    documentNumber: document.documentNumber,
    expiresOn: document.expiresOn,
    status,
    daysToExpiry,
  };
}
