import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

/**
 * The descriptive counts a health-centre profile carries — the sick-bay occupancy (capacity, active
 * admissions, beds available, occupancy percent, over-capacity, all produced by the pure occupancy
 * engine), and the live clinical workload (open appointments and encounters, active prescriptions and
 * those with overdue doses via the medication-schedule engine, and open referrals). All derived from
 * primary data; the profile is never posted to directly and carries no clinical content.
 */
export interface CentreProfileCounts {
  readonly sickBayCapacity: number;
  readonly activeAdmissionCount: number;
  readonly bedsAvailable: number;
  readonly occupancyPercent: number;
  readonly overCapacity: boolean;
  readonly openAppointmentCount: number;
  readonly openEncounterCount: number;
  readonly activePrescriptionCount: number;
  readonly overduePrescriptionCount: number;
  readonly openReferralCount: number;
}

/**
 * A health-centre profile — the descriptive read model of a centre's sick-bay occupancy and clinical
 * workload, kept in step by the two pure engines and repository counts. It is never a transaction: it is
 * refreshed (bumping `version`) whenever the underlying clinical activity changes. Exactly one per centre.
 */
export interface CentreProfile extends CentreProfileCounts {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly centreId: Uuid;
  readonly centreCode: string;
  readonly version: number;
  readonly refreshedAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateCentreProfileParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly centreId: Uuid;
  readonly centreCode: string;
  readonly counts: CentreProfileCounts;
}

/** Create a centre profile from a first reconciliation (version 1). */
export function createCentreProfile(params: CreateCentreProfileParams): CentreProfile {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    centreId: params.centreId,
    centreCode: params.centreCode,
    ...params.counts,
    version: 1,
    refreshedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

/** Refresh a centre profile from a fresh reconciliation, bumping the version. */
export function refreshCentreProfile(
  existing: CentreProfile,
  counts: CentreProfileCounts,
): CentreProfile {
  const now = nowIso();
  return {
    ...existing,
    ...counts,
    version: existing.version + 1,
    refreshedAt: now,
    updatedAt: now,
  };
}
