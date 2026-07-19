import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

/** A coarse risk band exposed by the intelligence profile. */
export type RiskLevel = "low" | "medium" | "high";

/**
 * AI-ready learner indicators. This milestone establishes the model and integration
 * points; other domains (attendance, academics, wellbeing) feed these signals, and
 * the Institutional Intelligence program consumes them for prediction. Every field
 * is nullable — absent until a source domain populates it.
 */
export interface IntelligenceIndicators {
  readonly academicRisk: RiskLevel | null;
  readonly academicTrajectory: string | null;
  readonly attendanceTrend: string | null;
  readonly behaviourTrend: string | null;
  readonly engagement: string | null;
  readonly wellbeing: string | null;
}

/** A recorded support intervention in the learner's history. */
export interface InterventionRecord {
  readonly kind: string;
  readonly on: string;
  readonly note: string | null;
  readonly byId: Uuid | null;
}

/**
 * The AI-ready intelligence profile of a {@link Student} — a structured, privacy-aware
 * container of learning/behavioural/attendance/wellbeing indicators and the
 * append-only intervention history. One per student.
 */
export interface IntelligenceProfile {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly studentId: Uuid;
  readonly organizationId: Uuid;
  readonly indicators: IntelligenceIndicators;
  readonly interventions: readonly InterventionRecord[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

const EMPTY_INDICATORS: IntelligenceIndicators = {
  academicRisk: null,
  academicTrajectory: null,
  attendanceTrend: null,
  behaviourTrend: null,
  engagement: null,
  wellbeing: null,
};

export interface CreateProfileParams {
  readonly tenantId: TenantId;
  readonly studentId: Uuid;
  readonly organizationId: Uuid;
}

/** Open a student's intelligence profile with empty indicators. */
export function createProfile(params: CreateProfileParams): IntelligenceProfile {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    studentId: params.studentId,
    organizationId: params.organizationId,
    indicators: EMPTY_INDICATORS,
    interventions: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Merge an indicator patch onto the profile (only provided fields change). */
export function updateIndicators(
  profile: IntelligenceProfile,
  patch: Partial<IntelligenceIndicators>,
): IntelligenceProfile {
  return {
    ...profile,
    indicators: { ...profile.indicators, ...patch },
    updatedAt: nowIso(),
  };
}

export interface RecordInterventionParams {
  readonly kind: string;
  readonly note?: string | null;
  readonly byId?: Uuid | null;
  readonly on?: string | null;
}

/** Append a support intervention to the profile's history (append-only). */
export function recordIntervention(
  profile: IntelligenceProfile,
  params: RecordInterventionParams,
): IntelligenceProfile {
  const record: InterventionRecord = {
    kind: params.kind.trim(),
    on: params.on ?? nowIso().slice(0, 10),
    note: params.note?.trim() || null,
    byId: params.byId ?? null,
  };
  return {
    ...profile,
    interventions: [...profile.interventions, record],
    updatedAt: nowIso(),
  };
}
