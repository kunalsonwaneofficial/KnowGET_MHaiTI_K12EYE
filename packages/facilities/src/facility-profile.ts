import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { BuildingCondition } from "./facilities-view";

/**
 * A facility profile — a descriptive, denormalized read model of one building's condition, refreshed by the
 * pure condition engine from the building's spaces and fixed systems, plus its count of open maintenance
 * orders. One row per building. It stores no truth of its own: every field is derived and re-derivable, so a
 * refresh always overwrites. Never money.
 */
export interface FacilityProfile {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly buildingId: Uuid;
  readonly buildingCode: string;
  readonly buildingName: string;
  readonly buildingStatus: string;
  readonly spaceCount: number;
  readonly availableSpaceCount: number;
  readonly outOfServiceSpaceCount: number;
  readonly totalCapacity: number;
  readonly availableCapacity: number;
  readonly systemCount: number;
  readonly operationalSystemCount: number;
  readonly systemsUnderMaintenance: number;
  readonly readinessPercent: number;
  readonly openMaintenanceCount: number;
  readonly refreshedAt: string;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface ComposeFacilityProfileParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly buildingId: Uuid;
  readonly buildingCode: string;
  readonly buildingName: string;
  readonly buildingStatus: string;
  readonly condition: BuildingCondition;
  readonly openMaintenanceCount: number;
  readonly refreshedAt: string;
}

const fieldsOf = (params: ComposeFacilityProfileParams) => ({
  tenantId: params.tenantId,
  organizationId: params.organizationId,
  buildingId: params.buildingId,
  buildingCode: params.buildingCode,
  buildingName: params.buildingName,
  buildingStatus: params.buildingStatus,
  spaceCount: params.condition.spaceCount,
  availableSpaceCount: params.condition.availableSpaceCount,
  outOfServiceSpaceCount: params.condition.outOfServiceSpaceCount,
  totalCapacity: params.condition.totalCapacity,
  availableCapacity: params.condition.availableCapacity,
  systemCount: params.condition.systemCount,
  operationalSystemCount: params.condition.operationalSystemCount,
  systemsUnderMaintenance: params.condition.systemsUnderMaintenance,
  readinessPercent: params.condition.readinessPercent,
  openMaintenanceCount: params.openMaintenanceCount,
  refreshedAt: params.refreshedAt,
});

/** Compose a fresh facility profile (new identity) from a building's derived condition. */
export function composeFacilityProfile(params: ComposeFacilityProfileParams): FacilityProfile {
  const now = nowIso();
  return { id: newUuid(), ...fieldsOf(params), createdAt: now, updatedAt: now };
}

/** Refresh an existing facility profile in place — same identity and creation time, new derived values. */
export function refreshFacilityProfile(
  existing: FacilityProfile,
  params: ComposeFacilityProfileParams,
): FacilityProfile {
  return {
    id: existing.id,
    ...fieldsOf(params),
    createdAt: existing.createdAt,
    updatedAt: nowIso(),
  };
}
