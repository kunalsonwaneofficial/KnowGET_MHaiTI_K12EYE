import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { AdmissionFunnel, IntakeSummary } from "./admissions-view";

/**
 * An admissions funnel profile — a descriptive, per-cycle read model that snapshots the outputs of the two
 * pure engines for one admission cycle: the funnel stage counts and conversion rates
 * (`computeAdmissionFunnel`) plus the cycle-wide intake picture (`summarizeIntake`). It is a derived
 * projection, never a source of truth — it is (re)built from the underlying aggregates by the refresh spine
 * and can be regenerated at any time. There is one profile per cycle.
 */
export interface AdmissionsFunnelProfile {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly cycleId: Uuid;
  // Funnel snapshot (from computeAdmissionFunnel).
  readonly leadCount: number;
  readonly applicationCount: number;
  readonly offerCount: number;
  readonly enrollmentCount: number;
  readonly leadToApplicationPercent: number;
  readonly applicationToOfferPercent: number;
  readonly offerToEnrollmentPercent: number;
  readonly overallConversionPercent: number;
  // Intake snapshot (from summarizeIntake).
  readonly gradeCount: number;
  readonly totalCapacity: number;
  readonly totalConfirmed: number;
  readonly fillPercent: number;
  readonly refreshedAt: ISODateString;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateAdmissionsFunnelProfileParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly cycleId: Uuid;
}

/** The engine outputs a refresh folds into the profile snapshot. */
export interface AdmissionsFunnelSnapshot {
  readonly funnel: AdmissionFunnel;
  readonly intake: IntakeSummary;
}

/** Create a fresh, empty funnel profile for a cycle — every count and rate zero until first refreshed. */
export function createAdmissionsFunnelProfile(
  params: CreateAdmissionsFunnelProfileParams,
): AdmissionsFunnelProfile {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    cycleId: params.cycleId,
    leadCount: 0,
    applicationCount: 0,
    offerCount: 0,
    enrollmentCount: 0,
    leadToApplicationPercent: 0,
    applicationToOfferPercent: 0,
    offerToEnrollmentPercent: 0,
    overallConversionPercent: 0,
    gradeCount: 0,
    totalCapacity: 0,
    totalConfirmed: 0,
    fillPercent: 0,
    refreshedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Fold the pure-engine outputs into the profile, restamping `refreshedAt`. Identity (id, cycle, createdAt) is
 * preserved; only the derived snapshot is replaced.
 */
export function refreshAdmissionsFunnelProfile(
  profile: AdmissionsFunnelProfile,
  snapshot: AdmissionsFunnelSnapshot,
): AdmissionsFunnelProfile {
  const now = nowIso();
  return {
    ...profile,
    leadCount: snapshot.funnel.leadCount,
    applicationCount: snapshot.funnel.applicationCount,
    offerCount: snapshot.funnel.offerCount,
    enrollmentCount: snapshot.funnel.enrollmentCount,
    leadToApplicationPercent: snapshot.funnel.leadToApplicationPercent,
    applicationToOfferPercent: snapshot.funnel.applicationToOfferPercent,
    offerToEnrollmentPercent: snapshot.funnel.offerToEnrollmentPercent,
    overallConversionPercent: snapshot.funnel.overallConversionPercent,
    gradeCount: snapshot.intake.gradeCount,
    totalCapacity: snapshot.intake.totalCapacity,
    totalConfirmed: snapshot.intake.totalConfirmed,
    fillPercent: snapshot.intake.fillPercent,
    refreshedAt: now,
    updatedAt: now,
  };
}
