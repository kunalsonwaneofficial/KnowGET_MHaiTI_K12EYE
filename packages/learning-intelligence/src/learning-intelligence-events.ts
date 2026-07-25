import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { EarlyWarning } from "./early-warning";
import type { EducationalInsight } from "./educational-insight";
import type { GrowthPlan } from "./growth-plan";
import type { LearnerInsightProfile } from "./learner-insight-profile";
import type { LearningSignal } from "./learning-signal";
import type { Recommendation } from "./recommendation";

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

// --- Early warning ---------------------------------------------------------------
export const EARLY_WARNING_RAISED = "insight.early_warning.raised";
export const EARLY_WARNING_RESOLVED = "insight.early_warning.resolved";

export interface EarlyWarningEventPayload {
  readonly warningId: Uuid;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly dimension: string;
  readonly ruleId: string;
  readonly severity: string;
  readonly status: string;
}

export type EarlyWarningRaisedEvent = DomainEvent<
  typeof EARLY_WARNING_RAISED,
  EarlyWarningEventPayload
>;
export type EarlyWarningResolvedEvent = DomainEvent<
  typeof EARLY_WARNING_RESOLVED,
  EarlyWarningEventPayload
>;

const earlyWarningPayload = (warning: EarlyWarning): EarlyWarningEventPayload => ({
  warningId: warning.id,
  organizationId: warning.organizationId,
  studentId: warning.studentId,
  dimension: warning.dimension,
  ruleId: warning.ruleId,
  severity: warning.severity,
  status: warning.status,
});

export const earlyWarningRaised = (warning: EarlyWarning): EarlyWarningRaisedEvent =>
  createEvent(EARLY_WARNING_RAISED, earlyWarningPayload(warning), { tenantId: warning.tenantId });

export const earlyWarningResolved = (warning: EarlyWarning): EarlyWarningResolvedEvent =>
  createEvent(EARLY_WARNING_RESOLVED, earlyWarningPayload(warning), {
    tenantId: warning.tenantId,
  });

// --- Educational insight ---------------------------------------------------------
export const INSIGHT_PUBLISHED = "insight.published";

export interface InsightPublishedPayload {
  readonly insightId: Uuid;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly category: string;
  readonly priority: string;
}

export type InsightPublishedEvent = DomainEvent<typeof INSIGHT_PUBLISHED, InsightPublishedPayload>;

export const insightPublished = (insight: EducationalInsight): InsightPublishedEvent =>
  createEvent(
    INSIGHT_PUBLISHED,
    {
      insightId: insight.id,
      organizationId: insight.organizationId,
      studentId: insight.studentId,
      category: insight.category,
      priority: insight.priority,
    },
    { tenantId: insight.tenantId },
  );

// --- Recommendation --------------------------------------------------------------
export const RECOMMENDATION_PROPOSED = "insight.recommendation.proposed";
export const RECOMMENDATION_ACCEPTED = "insight.recommendation.accepted";

export interface RecommendationEventPayload {
  readonly recommendationId: Uuid;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly category: string;
  readonly priority: string;
  readonly status: string;
}

export type RecommendationProposedEvent = DomainEvent<
  typeof RECOMMENDATION_PROPOSED,
  RecommendationEventPayload
>;
export type RecommendationAcceptedEvent = DomainEvent<
  typeof RECOMMENDATION_ACCEPTED,
  RecommendationEventPayload
>;

const recommendationPayload = (recommendation: Recommendation): RecommendationEventPayload => ({
  recommendationId: recommendation.id,
  organizationId: recommendation.organizationId,
  studentId: recommendation.studentId,
  category: recommendation.category,
  priority: recommendation.priority,
  status: recommendation.status,
});

export const recommendationProposed = (
  recommendation: Recommendation,
): RecommendationProposedEvent =>
  createEvent(RECOMMENDATION_PROPOSED, recommendationPayload(recommendation), {
    tenantId: recommendation.tenantId,
  });

export const recommendationAccepted = (
  recommendation: Recommendation,
): RecommendationAcceptedEvent =>
  createEvent(RECOMMENDATION_ACCEPTED, recommendationPayload(recommendation), {
    tenantId: recommendation.tenantId,
  });

// --- Growth plan -----------------------------------------------------------------
export const GROWTH_PLAN_ACTIVATED = "insight.growth_plan.activated";
export const GROWTH_PLAN_ACHIEVED = "insight.growth_plan.achieved";

export interface GrowthPlanEventPayload {
  readonly growthPlanId: Uuid;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly status: string;
  readonly progressPercent: number;
}

export type GrowthPlanActivatedEvent = DomainEvent<
  typeof GROWTH_PLAN_ACTIVATED,
  GrowthPlanEventPayload
>;
export type GrowthPlanAchievedEvent = DomainEvent<
  typeof GROWTH_PLAN_ACHIEVED,
  GrowthPlanEventPayload
>;

const growthPlanPayload = (plan: GrowthPlan): GrowthPlanEventPayload => ({
  growthPlanId: plan.id,
  organizationId: plan.organizationId,
  studentId: plan.studentId,
  status: plan.status,
  progressPercent: plan.progressPercent,
});

export const growthPlanActivated = (plan: GrowthPlan): GrowthPlanActivatedEvent =>
  createEvent(GROWTH_PLAN_ACTIVATED, growthPlanPayload(plan), { tenantId: plan.tenantId });

export const growthPlanAchieved = (plan: GrowthPlan): GrowthPlanAchievedEvent =>
  createEvent(GROWTH_PLAN_ACHIEVED, growthPlanPayload(plan), { tenantId: plan.tenantId });
