import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { AlumniActivityView, AlumniEngagement } from "./alumni-view";
import type { EngagementLevel } from "./alumni-value";

/**
 * An alumni engagement profile — a descriptive, per-alumnus read model that snapshots the engagement engine's
 * output for one alumni profile: the activity counts (events attended, active chapters, active mentorships,
 * contributions) and the derived engagement score and level. It is a projection, never a source of truth — it
 * is (re)built from the underlying activity by the refresh spine and can be regenerated at any time. There is
 * one engagement profile per alumni profile.
 */
export interface AlumniEngagementProfile {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly alumniProfileId: Uuid;
  readonly eventsAttended: number;
  readonly activeChapters: number;
  readonly activeMentorships: number;
  readonly contributionsCount: number;
  readonly score: number;
  readonly level: EngagementLevel;
  readonly refreshedAt: ISODateString;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateAlumniEngagementProfileParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly alumniProfileId: Uuid;
}

/** The engine inputs and output a refresh folds into the profile snapshot. */
export interface AlumniEngagementSnapshot {
  readonly activity: AlumniActivityView;
  readonly engagement: AlumniEngagement;
}

/** Create a fresh, empty engagement profile for an alumnus — every count and score zero, level `inactive`. */
export function createAlumniEngagementProfile(
  params: CreateAlumniEngagementProfileParams,
): AlumniEngagementProfile {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    alumniProfileId: params.alumniProfileId,
    eventsAttended: 0,
    activeChapters: 0,
    activeMentorships: 0,
    contributionsCount: 0,
    score: 0,
    level: "inactive",
    refreshedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Fold the engine inputs + output into the profile, restamping `refreshedAt`. Identity (id, alumni profile,
 * createdAt) is preserved; only the derived snapshot is replaced.
 */
export function refreshAlumniEngagementProfile(
  profile: AlumniEngagementProfile,
  snapshot: AlumniEngagementSnapshot,
): AlumniEngagementProfile {
  const now = nowIso();
  return {
    ...profile,
    eventsAttended: snapshot.activity.eventsAttended,
    activeChapters: snapshot.activity.activeChapters,
    activeMentorships: snapshot.activity.activeMentorships,
    contributionsCount: snapshot.activity.contributionsCount,
    score: snapshot.engagement.score,
    level: snapshot.engagement.level,
    refreshedAt: now,
    updatedAt: now,
  };
}
