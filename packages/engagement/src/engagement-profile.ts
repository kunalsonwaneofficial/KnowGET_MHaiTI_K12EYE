import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

/**
 * An engagement profile — a descriptive, re-derivable read model of one audience's engagement: its size, its
 * published-announcement reach (count, total acknowledged, overall acknowledgement percent) and its survey
 * response picture (count, total responses, overall response percent). Every field is computed by the two
 * pure engines from primary data and **refreshed** (overwritten) whenever the picture changes — it holds no
 * truth of its own and is never a forecast. One profile per audience.
 */
export interface EngagementProfile {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly audienceId: Uuid;
  readonly audienceCode: string;
  readonly audienceName: string;
  readonly audienceSize: number;
  readonly announcementCount: number;
  readonly totalAcknowledged: number;
  readonly acknowledgementPercent: number;
  readonly surveyCount: number;
  readonly totalResponses: number;
  readonly responsePercent: number;
  readonly refreshedAt: string;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface EngagementProfileFacts {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly audienceId: Uuid;
  readonly audienceCode: string;
  readonly audienceName: string;
  readonly audienceSize: number;
  readonly announcementCount: number;
  readonly totalAcknowledged: number;
  readonly acknowledgementPercent: number;
  readonly surveyCount: number;
  readonly totalResponses: number;
  readonly responsePercent: number;
  readonly refreshedAt: string;
}

/** Compose a fresh engagement profile from derived facts. */
export function composeEngagementProfile(facts: EngagementProfileFacts): EngagementProfile {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: facts.tenantId,
    organizationId: facts.organizationId,
    audienceId: facts.audienceId,
    audienceCode: facts.audienceCode,
    audienceName: facts.audienceName,
    audienceSize: facts.audienceSize,
    announcementCount: facts.announcementCount,
    totalAcknowledged: facts.totalAcknowledged,
    acknowledgementPercent: facts.acknowledgementPercent,
    surveyCount: facts.surveyCount,
    totalResponses: facts.totalResponses,
    responsePercent: facts.responsePercent,
    refreshedAt: facts.refreshedAt,
    createdAt: now,
    updatedAt: now,
  };
}

/** Refresh (overwrite) an existing engagement profile from newly derived facts, keeping its identity. */
export function refreshEngagementProfile(
  existing: EngagementProfile,
  facts: EngagementProfileFacts,
): EngagementProfile {
  return {
    ...existing,
    audienceCode: facts.audienceCode,
    audienceName: facts.audienceName,
    audienceSize: facts.audienceSize,
    announcementCount: facts.announcementCount,
    totalAcknowledged: facts.totalAcknowledged,
    acknowledgementPercent: facts.acknowledgementPercent,
    surveyCount: facts.surveyCount,
    totalResponses: facts.totalResponses,
    responsePercent: facts.responsePercent,
    refreshedAt: facts.refreshedAt,
    updatedAt: nowIso(),
  };
}
