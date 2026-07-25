import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { PresenceIndicators } from "./presence-intelligence";

/**
 * A participant's longitudinal presence profile — the latest computed presence indicators
 * (attendance %, punctuality, absenteeism, participation, engagement, risk). One per
 * participant. It is a materialised snapshot: the presence-intelligence engine recomputes
 * the indicators from the participant's records, leave and participation, and the profile
 * stores them with a version counter and the time of computation. AI-ready semantic signals
 * only — predictive intelligence lives in the Institutional Intelligence program.
 */
export interface PresenceProfile {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly participantId: Uuid;
  readonly attendancePercentage: number;
  readonly punctualityRate: number;
  readonly longestAbsentStreak: number;
  readonly chronicAbsenteeism: boolean;
  readonly participationCount: number;
  readonly participationDiversity: number;
  readonly leaveCount: number;
  readonly engagementScore: number;
  readonly riskLevel: "low" | "medium" | "high";
  readonly anomalies: readonly string[];
  readonly lastComputedAt: ISODateString | null;
  readonly version: number;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreatePresenceProfileParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly participantId: Uuid;
}

/** Create an empty presence profile for a participant (no indicators computed yet). */
export function createPresenceProfile(params: CreatePresenceProfileParams): PresenceProfile {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    participantId: params.participantId,
    attendancePercentage: 100,
    punctualityRate: 100,
    longestAbsentStreak: 0,
    chronicAbsenteeism: false,
    participationCount: 0,
    participationDiversity: 0,
    leaveCount: 0,
    engagementScore: 0,
    riskLevel: "low",
    anomalies: [],
    lastComputedAt: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/** Apply a freshly-computed indicator snapshot, bumping the version and stamping the time. */
export function applyIndicators(
  profile: PresenceProfile,
  indicators: PresenceIndicators,
): PresenceProfile {
  return {
    ...profile,
    attendancePercentage: indicators.attendancePercentage,
    punctualityRate: indicators.punctualityRate,
    longestAbsentStreak: indicators.longestAbsentStreak,
    chronicAbsenteeism: indicators.chronicAbsenteeism,
    participationCount: indicators.participationCount,
    participationDiversity: indicators.participationDiversity,
    leaveCount: indicators.leaveCount,
    engagementScore: indicators.engagementScore,
    riskLevel: indicators.riskLevel,
    anomalies: [...indicators.anomalies],
    lastComputedAt: nowIso(),
    version: profile.version + 1,
    updatedAt: nowIso(),
  };
}
