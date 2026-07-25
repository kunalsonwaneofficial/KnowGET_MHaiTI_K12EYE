import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { LearnerInsightProfile } from "./learner-insight-profile";
import type { LearningSignal } from "./learning-signal";

// --- Learning signal -------------------------------------------------------------
export const SIGNAL_CAPTURED = "insight.signal.captured";

export interface SignalCapturedPayload {
  readonly signalId: Uuid;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly dimension: string;
  readonly source: string;
  readonly metric: string;
  readonly value: number;
}

export type SignalCapturedEvent = DomainEvent<typeof SIGNAL_CAPTURED, SignalCapturedPayload>;

export const signalCaptured = (signal: LearningSignal): SignalCapturedEvent =>
  createEvent(
    SIGNAL_CAPTURED,
    {
      signalId: signal.id,
      organizationId: signal.organizationId,
      studentId: signal.studentId,
      dimension: signal.dimension,
      source: signal.source,
      metric: signal.metric,
      value: signal.value,
    },
    { tenantId: signal.tenantId },
  );

// --- Learner insight profile -----------------------------------------------------
export const PROFILE_REFRESHED = "insight.profile.refreshed";

export interface ProfileRefreshedPayload {
  readonly profileId: Uuid;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly overallScore: number;
  readonly overallBand: string;
  readonly status: string;
}

export type ProfileRefreshedEvent = DomainEvent<typeof PROFILE_REFRESHED, ProfileRefreshedPayload>;

export const profileRefreshed = (profile: LearnerInsightProfile): ProfileRefreshedEvent =>
  createEvent(
    PROFILE_REFRESHED,
    {
      profileId: profile.id,
      organizationId: profile.organizationId,
      studentId: profile.studentId,
      overallScore: profile.overallScore,
      overallBand: profile.overallBand,
      status: profile.status,
    },
    { tenantId: profile.tenantId },
  );
