import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { computeDepreciation } from "./depreciation";
import {
  EmptyAssetNameError,
  EmptyAssetTagError,
  InvalidAssetTransitionError,
  InvalidAssetValuationError,
  InvalidCurrencyError,
  InvalidMoneyError,
  NegativeAmountError,
} from "./errors";
import { isCurrencyCode } from "./money";
import type { AssetStatus } from "./resource-value";
import type { DepreciationResult } from "./resource-view";

/**
 * A fixed asset — a tracked capital item (equipment, furniture, vehicle). It carries an acquisition
 * cost, a salvage value and a useful life (the inputs the pure depreciation engine uses to derive net
 * book value), an optional employee custodian and location, and runs `in_service ↔ under_maintenance`,
 * then `→ retired → disposed`. The `assetTag` is unique within the tenant.
 */
export interface Asset {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly assetTag: string;
  readonly name: string;
  readonly category: string | null;
  readonly custodianId: Uuid | null;
  readonly location: string | null;
  readonly acquisitionCostMinor: number;
  readonly salvageValueMinor: number;
  readonly currency: string;
  readonly acquisitionDate: string;
  readonly usefulLifeMonths: number;
  readonly status: AssetStatus;
  readonly retiredAt: ISODateString | null;
  readonly disposedAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RegisterAssetParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly assetTag: string;
  readonly name: string;
  readonly acquisitionCostMinor: number;
  readonly salvageValueMinor: number;
  readonly currency: string;
  readonly acquisitionDate: string;
  readonly usefulLifeMonths: number;
  readonly category?: string | null;
  readonly custodianId?: Uuid | null;
  readonly location?: string | null;
}

function validateValuation(
  acquisitionCostMinor: number,
  salvageValueMinor: number,
  usefulLifeMonths: number,
  currency: string,
): void {
  if (!Number.isInteger(acquisitionCostMinor)) {
    throw new InvalidMoneyError(acquisitionCostMinor);
  }
  if (acquisitionCostMinor < 0) {
    throw new NegativeAmountError(acquisitionCostMinor);
  }
  if (!Number.isInteger(salvageValueMinor)) {
    throw new InvalidMoneyError(salvageValueMinor);
  }
  if (salvageValueMinor < 0) {
    throw new NegativeAmountError(salvageValueMinor);
  }
  if (salvageValueMinor > acquisitionCostMinor) {
    throw new InvalidAssetValuationError("the salvage value cannot exceed the acquisition cost");
  }
  if (!Number.isInteger(usefulLifeMonths) || usefulLifeMonths <= 0) {
    throw new InvalidAssetValuationError("the useful life must be a positive number of months");
  }
  if (!isCurrencyCode(currency)) {
    throw new InvalidCurrencyError(currency);
  }
}

/** Register a fixed asset (status `in_service`). Tag, name and a valid valuation required. */
export function registerAsset(params: RegisterAssetParams): Asset {
  const assetTag = params.assetTag.trim();
  if (assetTag.length === 0) {
    throw new EmptyAssetTagError();
  }
  const name = params.name.trim();
  if (name.length === 0) {
    throw new EmptyAssetNameError();
  }
  validateValuation(
    params.acquisitionCostMinor,
    params.salvageValueMinor,
    params.usefulLifeMonths,
    params.currency,
  );
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    assetTag,
    name,
    category: params.category?.trim() || null,
    custodianId: params.custodianId ?? null,
    location: params.location?.trim() || null,
    acquisitionCostMinor: params.acquisitionCostMinor,
    salvageValueMinor: params.salvageValueMinor,
    currency: params.currency,
    acquisitionDate: params.acquisitionDate,
    usefulLifeMonths: params.usefulLifeMonths,
    status: "in_service",
    retiredAt: null,
    disposedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (asset: Asset, patch: Partial<Asset>): Asset => ({
  ...asset,
  ...patch,
  updatedAt: nowIso(),
});

/** Rename an asset. */
export function renameAsset(asset: Asset, name: string): Asset {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new EmptyAssetNameError();
  }
  return touch(asset, { name: trimmed });
}

/** Set (or clear) the asset's category. */
export const setAssetCategory = (asset: Asset, category: string | null): Asset =>
  touch(asset, { category: category?.trim() || null });

/** Set (or clear) the asset's location. */
export const setAssetLocation = (asset: Asset, location: string | null): Asset =>
  touch(asset, { location: location?.trim() || null });

/** Assign (or clear) the asset's custodian. */
export const assignCustodian = (asset: Asset, custodianId: Uuid | null): Asset =>
  touch(asset, { custodianId });

/** Send an in-service asset for maintenance (→ `under_maintenance`). */
export function sendAssetToMaintenance(asset: Asset): Asset {
  if (asset.status !== "in_service") {
    throw new InvalidAssetTransitionError(asset.status, "under_maintenance");
  }
  return touch(asset, { status: "under_maintenance" });
}

/** Return an asset from maintenance (→ `in_service`). */
export function returnAssetFromMaintenance(asset: Asset): Asset {
  if (asset.status !== "under_maintenance") {
    throw new InvalidAssetTransitionError(asset.status, "in_service");
  }
  return touch(asset, { status: "in_service" });
}

/** Retire an in-service or under-maintenance asset (→ `retired`), stamping the time. */
export function retireAsset(asset: Asset): Asset {
  if (asset.status !== "in_service" && asset.status !== "under_maintenance") {
    throw new InvalidAssetTransitionError(asset.status, "retired");
  }
  return touch(asset, { status: "retired", retiredAt: nowIso() });
}

/** Dispose of a retired asset (→ `disposed`), stamping the time. */
export function disposeAsset(asset: Asset): Asset {
  if (asset.status !== "retired") {
    throw new InvalidAssetTransitionError(asset.status, "disposed");
  }
  return touch(asset, { status: "disposed", disposedAt: nowIso() });
}

/** Whether the asset is currently in service. */
export const isAssetInService = (asset: Asset): boolean => asset.status === "in_service";

/**
 * Whole months elapsed between two date-only (`YYYY-MM-DD`) values, floored at zero — a partial final
 * month does not count. Deterministic (no clock); the caller passes the as-of date.
 */
export function elapsedMonths(fromDate: string, toDate: string): number {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return 0;
  }
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) {
    months -= 1;
  }
  return Math.max(0, months);
}

/** The asset's depreciation as of a date — runs the pure engine over the months since acquisition. */
export const assetDepreciationAsOf = (asset: Asset, asOfDate: string): DepreciationResult =>
  computeDepreciation(asset, elapsedMonths(asset.acquisitionDate, asOfDate));
