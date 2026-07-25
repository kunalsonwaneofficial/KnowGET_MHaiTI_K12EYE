import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyMaintenanceDescriptionError,
  InvalidCurrencyError,
  InvalidMaintenanceTransitionError,
  InvalidMoneyError,
  NegativeAmountError,
} from "./errors";
import { isCurrencyCode } from "./money";
import type { MaintenanceStatus } from "./resource-value";

/**
 * An asset-maintenance record — a scheduled or performed piece of upkeep against an {@link Asset}
 * (service, repair, calibration). It runs `scheduled → completed | cancelled`; completing it records
 * the performed date and the actual cost. Maintenance is a log against the asset; the asset's
 * `under_maintenance` status is managed separately on the asset itself.
 */
export interface AssetMaintenance {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly assetId: Uuid;
  readonly description: string;
  readonly scheduledDate: string | null;
  readonly performedDate: string | null;
  readonly costMinor: number | null;
  readonly currency: string | null;
  readonly status: MaintenanceStatus;
  readonly notes: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface ScheduleMaintenanceParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly assetId: Uuid;
  readonly description: string;
  readonly scheduledDate?: string | null;
  readonly notes?: string | null;
}

/** Validate an optional maintenance cost: either both amount and currency, or neither. */
function normalizeCost(
  amountMinor: number | null | undefined,
  currency: string | null | undefined,
): { costMinor: number | null; currency: string | null } {
  if (amountMinor === null || amountMinor === undefined) {
    return { costMinor: null, currency: null };
  }
  if (!Number.isInteger(amountMinor)) {
    throw new InvalidMoneyError(amountMinor);
  }
  if (amountMinor < 0) {
    throw new NegativeAmountError(amountMinor);
  }
  if (!currency || !isCurrencyCode(currency)) {
    throw new InvalidCurrencyError(currency ?? "");
  }
  return { costMinor: amountMinor, currency };
}

/** Schedule maintenance against an asset (status `scheduled`). Description required. */
export function scheduleMaintenance(params: ScheduleMaintenanceParams): AssetMaintenance {
  const description = params.description.trim();
  if (description.length === 0) {
    throw new EmptyMaintenanceDescriptionError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    assetId: params.assetId,
    description,
    scheduledDate: params.scheduledDate ?? null,
    performedDate: null,
    costMinor: null,
    currency: null,
    status: "scheduled",
    notes: params.notes?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  maintenance: AssetMaintenance,
  patch: Partial<AssetMaintenance>,
): AssetMaintenance => ({
  ...maintenance,
  ...patch,
  updatedAt: nowIso(),
});

/** Set (or clear) the scheduled date while still scheduled. */
export function setMaintenanceSchedule(
  maintenance: AssetMaintenance,
  scheduledDate: string | null,
): AssetMaintenance {
  if (maintenance.status !== "scheduled") {
    throw new InvalidMaintenanceTransitionError(maintenance.status, "reschedule");
  }
  return touch(maintenance, { scheduledDate });
}

export interface CompleteMaintenanceParams {
  readonly performedDate: string;
  readonly costMinor?: number | null;
  readonly currency?: string | null;
  readonly notes?: string | null;
}

/** Complete a scheduled maintenance (→ `completed`), recording the performed date and actual cost. */
export function completeMaintenance(
  maintenance: AssetMaintenance,
  params: CompleteMaintenanceParams,
): AssetMaintenance {
  if (maintenance.status !== "scheduled") {
    throw new InvalidMaintenanceTransitionError(maintenance.status, "completed");
  }
  const cost = normalizeCost(params.costMinor, params.currency);
  return touch(maintenance, {
    status: "completed",
    performedDate: params.performedDate,
    costMinor: cost.costMinor,
    currency: cost.currency,
    ...(params.notes !== undefined ? { notes: params.notes?.trim() || null } : {}),
  });
}

/** Cancel a scheduled maintenance (→ `cancelled`). */
export function cancelMaintenance(
  maintenance: AssetMaintenance,
  notes?: string | null,
): AssetMaintenance {
  if (maintenance.status !== "scheduled") {
    throw new InvalidMaintenanceTransitionError(maintenance.status, "cancelled");
  }
  return touch(maintenance, {
    status: "cancelled",
    ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
  });
}
