import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyDigitalTitleError, InvalidDigitalTransitionError } from "./errors";
import type { AccessModel, DigitalFormat, DigitalStatus } from "./library-value";

/**
 * A digital learning asset — an e-book, audiobook, video, e-journal, courseware unit or dataset the
 * institution provides. It carries a format, an access model (freely open, individually licensed, or
 * subscription-based), an access reference (a URL/locator — the bytes live in the media/files platform,
 * not here), an optional provider, and, for licensed/subscription content, a licence expiry. It runs
 * `active ↔ retired`. The organization is the campus node it belongs to. There are no physical copies.
 */
export interface DigitalAsset {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly title: string;
  readonly format: DigitalFormat;
  readonly accessModel: AccessModel;
  readonly accessUrl: string | null;
  readonly provider: string | null;
  readonly licenseExpiry: string | null;
  readonly status: DigitalStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CatalogDigitalAssetParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly title: string;
  readonly format: DigitalFormat;
  readonly accessModel: AccessModel;
  readonly accessUrl?: string | null;
  readonly provider?: string | null;
  readonly licenseExpiry?: string | null;
}

/** Catalog a digital asset (status `active`). A non-empty title is required. */
export function catalogDigitalAsset(params: CatalogDigitalAssetParams): DigitalAsset {
  const title = params.title.trim();
  if (title.length === 0) {
    throw new EmptyDigitalTitleError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    title,
    format: params.format,
    accessModel: params.accessModel,
    accessUrl: params.accessUrl?.trim() || null,
    provider: params.provider?.trim() || null,
    licenseExpiry: params.licenseExpiry?.trim() || null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (asset: DigitalAsset, patch: Partial<DigitalAsset>): DigitalAsset => ({
  ...asset,
  ...patch,
  updatedAt: nowIso(),
});

/** Rename a digital asset. */
export function renameDigitalAsset(asset: DigitalAsset, title: string): DigitalAsset {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    throw new EmptyDigitalTitleError();
  }
  return touch(asset, { title: trimmed });
}

/** Set the digital asset's access model, reference and provider. */
export const setDigitalAccess = (
  asset: DigitalAsset,
  accessModel: AccessModel,
  accessUrl: string | null,
  provider: string | null,
): DigitalAsset =>
  touch(asset, {
    accessModel,
    accessUrl: accessUrl?.trim() || null,
    provider: provider?.trim() || null,
  });

/** Renew (or clear) the digital asset's licence expiry. */
export const renewDigitalLicense = (
  asset: DigitalAsset,
  licenseExpiry: string | null,
): DigitalAsset => touch(asset, { licenseExpiry: licenseExpiry?.trim() || null });

/** Retire a digital asset (→ `retired`). */
export function retireDigitalAsset(asset: DigitalAsset): DigitalAsset {
  if (asset.status !== "active") {
    throw new InvalidDigitalTransitionError(asset.status, "retired");
  }
  return touch(asset, { status: "retired" });
}

/** Reactivate a retired digital asset (→ `active`). */
export function reactivateDigitalAsset(asset: DigitalAsset): DigitalAsset {
  if (asset.status !== "retired") {
    throw new InvalidDigitalTransitionError(asset.status, "active");
  }
  return touch(asset, { status: "active" });
}

/** Whether the digital asset is active (accessible). */
export const isDigitalAssetActive = (asset: DigitalAsset): boolean => asset.status === "active";

/**
 * Whether the digital asset's access is valid as of a date — open content is always valid; licensed or
 * subscription content is valid when it has no recorded expiry or the expiry is on or after that date.
 * Deterministic (no clock); the caller passes the as-of date.
 */
export const isDigitalAccessValidAsOf = (asset: DigitalAsset, asOfDate: string): boolean =>
  asset.accessModel === "open" || asset.licenseExpiry === null || asset.licenseExpiry >= asOfDate;
