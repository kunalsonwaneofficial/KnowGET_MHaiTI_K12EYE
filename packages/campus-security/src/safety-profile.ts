import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { AccessActivitySummary, ZonePresence } from "./campus-security-view";

/**
 * A safety profile — a descriptive, denormalized read model of one access zone's live security posture: its
 * on-site visitor presence (from the presence engine over checked-in visits), its count of open security
 * incidents, its count of active credentials that grant it, and its granted/denied access activity (from the
 * access engine over its events). One row per zone. It holds no truth of its own — every field is derived
 * and re-derivable, so a refresh always overwrites. Never money.
 */
export interface SafetyProfile {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly zoneId: Uuid;
  readonly zoneCode: string;
  readonly zoneName: string;
  readonly securityLevel: string;
  readonly zoneStatus: string;
  readonly capacity: number;
  readonly onSiteVisitorCount: number;
  readonly available: number;
  readonly overCapacity: boolean;
  readonly occupancyPercent: number;
  readonly openIncidentCount: number;
  readonly activeCredentialCount: number;
  readonly accessGrantedCount: number;
  readonly accessDeniedCount: number;
  readonly refreshedAt: string;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface ComposeSafetyProfileParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly zoneId: Uuid;
  readonly zoneCode: string;
  readonly zoneName: string;
  readonly securityLevel: string;
  readonly zoneStatus: string;
  readonly presence: ZonePresence;
  readonly openIncidentCount: number;
  readonly activeCredentialCount: number;
  readonly activity: AccessActivitySummary;
  readonly refreshedAt: string;
}

const fieldsOf = (params: ComposeSafetyProfileParams) => ({
  tenantId: params.tenantId,
  organizationId: params.organizationId,
  zoneId: params.zoneId,
  zoneCode: params.zoneCode,
  zoneName: params.zoneName,
  securityLevel: params.securityLevel,
  zoneStatus: params.zoneStatus,
  capacity: params.presence.capacity,
  onSiteVisitorCount: params.presence.onSiteCount,
  available: params.presence.available,
  overCapacity: params.presence.overCapacity,
  occupancyPercent: params.presence.occupancyPercent,
  openIncidentCount: params.openIncidentCount,
  activeCredentialCount: params.activeCredentialCount,
  accessGrantedCount: params.activity.granted,
  accessDeniedCount: params.activity.denied,
  refreshedAt: params.refreshedAt,
});

/** Compose a fresh safety profile (new identity) from a zone's derived security posture. */
export function composeSafetyProfile(params: ComposeSafetyProfileParams): SafetyProfile {
  const now = nowIso();
  return { id: newUuid(), ...fieldsOf(params), createdAt: now, updatedAt: now };
}

/** Refresh an existing safety profile in place — same identity and creation time, new derived values. */
export function refreshSafetyProfile(
  existing: SafetyProfile,
  params: ComposeSafetyProfileParams,
): SafetyProfile {
  return {
    id: existing.id,
    ...fieldsOf(params),
    createdAt: existing.createdAt,
    updatedAt: nowIso(),
  };
}
