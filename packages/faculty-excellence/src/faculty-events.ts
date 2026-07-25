import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { CoachingEngagement } from "./coaching-engagement";
import type { CoachingSession } from "./coaching-session";
import type { CompetencyFramework } from "./competency-framework";
import type { Observation } from "./observation";
import type { ProfessionalLearningActivity } from "./professional-learning-activity";

// --- Competency framework --------------------------------------------------------
export const FRAMEWORK_CREATED = "faculty.framework.created";
export const FRAMEWORK_ACTIVATED = "faculty.framework.activated";
export const FRAMEWORK_ARCHIVED = "faculty.framework.archived";

export interface FrameworkEventPayload {
  readonly frameworkId: Uuid;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly competencyCount: number;
  readonly status: string;
}

export type FrameworkCreatedEvent = DomainEvent<typeof FRAMEWORK_CREATED, FrameworkEventPayload>;
export type FrameworkActivatedEvent = DomainEvent<
  typeof FRAMEWORK_ACTIVATED,
  FrameworkEventPayload
>;
export type FrameworkArchivedEvent = DomainEvent<typeof FRAMEWORK_ARCHIVED, FrameworkEventPayload>;

const frameworkPayload = (framework: CompetencyFramework): FrameworkEventPayload => ({
  frameworkId: framework.id,
  organizationId: framework.organizationId,
  code: framework.code,
  competencyCount: framework.competencies.length,
  status: framework.status,
});

export const frameworkCreated = (framework: CompetencyFramework): FrameworkCreatedEvent =>
  createEvent(FRAMEWORK_CREATED, frameworkPayload(framework), { tenantId: framework.tenantId });

export const frameworkActivated = (framework: CompetencyFramework): FrameworkActivatedEvent =>
  createEvent(FRAMEWORK_ACTIVATED, frameworkPayload(framework), { tenantId: framework.tenantId });

export const frameworkArchived = (framework: CompetencyFramework): FrameworkArchivedEvent =>
  createEvent(FRAMEWORK_ARCHIVED, frameworkPayload(framework), { tenantId: framework.tenantId });

// --- Observation -----------------------------------------------------------------
export const OBSERVATION_CONDUCTED = "faculty.observation.conducted";
export const OBSERVATION_SHARED = "faculty.observation.shared";
export const OBSERVATION_ACKNOWLEDGED = "faculty.observation.acknowledged";

export interface ObservationEventPayload {
  readonly observationId: Uuid;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly observerId: Uuid;
  readonly frameworkId: Uuid;
  readonly overallRating: number | null;
  readonly status: string;
}

export type ObservationConductedEvent = DomainEvent<
  typeof OBSERVATION_CONDUCTED,
  ObservationEventPayload
>;
export type ObservationSharedEvent = DomainEvent<
  typeof OBSERVATION_SHARED,
  ObservationEventPayload
>;
export type ObservationAcknowledgedEvent = DomainEvent<
  typeof OBSERVATION_ACKNOWLEDGED,
  ObservationEventPayload
>;

const observationPayload = (observation: Observation): ObservationEventPayload => ({
  observationId: observation.id,
  organizationId: observation.organizationId,
  employeeId: observation.employeeId,
  observerId: observation.observerId,
  frameworkId: observation.frameworkId,
  overallRating: observation.overallRating,
  status: observation.status,
});

export const observationConducted = (observation: Observation): ObservationConductedEvent =>
  createEvent(OBSERVATION_CONDUCTED, observationPayload(observation), {
    tenantId: observation.tenantId,
  });

export const observationShared = (observation: Observation): ObservationSharedEvent =>
  createEvent(OBSERVATION_SHARED, observationPayload(observation), {
    tenantId: observation.tenantId,
  });

export const observationAcknowledged = (observation: Observation): ObservationAcknowledgedEvent =>
  createEvent(OBSERVATION_ACKNOWLEDGED, observationPayload(observation), {
    tenantId: observation.tenantId,
  });

// --- Coaching engagement ---------------------------------------------------------
export const ENGAGEMENT_PROPOSED = "faculty.coaching.proposed";
export const ENGAGEMENT_ACCEPTED = "faculty.coaching.accepted";
export const ENGAGEMENT_COMPLETED = "faculty.coaching.completed";

export interface EngagementEventPayload {
  readonly engagementId: Uuid;
  readonly organizationId: Uuid;
  readonly coachId: Uuid;
  readonly coacheeId: Uuid;
  readonly status: string;
}

export type EngagementProposedEvent = DomainEvent<
  typeof ENGAGEMENT_PROPOSED,
  EngagementEventPayload
>;
export type EngagementAcceptedEvent = DomainEvent<
  typeof ENGAGEMENT_ACCEPTED,
  EngagementEventPayload
>;
export type EngagementCompletedEvent = DomainEvent<
  typeof ENGAGEMENT_COMPLETED,
  EngagementEventPayload
>;

const engagementPayload = (engagement: CoachingEngagement): EngagementEventPayload => ({
  engagementId: engagement.id,
  organizationId: engagement.organizationId,
  coachId: engagement.coachId,
  coacheeId: engagement.coacheeId,
  status: engagement.status,
});

export const engagementProposed = (engagement: CoachingEngagement): EngagementProposedEvent =>
  createEvent(ENGAGEMENT_PROPOSED, engagementPayload(engagement), {
    tenantId: engagement.tenantId,
  });

export const engagementAccepted = (engagement: CoachingEngagement): EngagementAcceptedEvent =>
  createEvent(ENGAGEMENT_ACCEPTED, engagementPayload(engagement), {
    tenantId: engagement.tenantId,
  });

export const engagementCompleted = (engagement: CoachingEngagement): EngagementCompletedEvent =>
  createEvent(ENGAGEMENT_COMPLETED, engagementPayload(engagement), {
    tenantId: engagement.tenantId,
  });

// --- Coaching session ------------------------------------------------------------
export const SESSION_LOGGED = "faculty.coaching.session_logged";

export interface SessionLoggedPayload {
  readonly sessionId: Uuid;
  readonly organizationId: Uuid;
  readonly engagementId: Uuid;
  readonly sessionDate: string;
}

export type SessionLoggedEvent = DomainEvent<typeof SESSION_LOGGED, SessionLoggedPayload>;

export const sessionLogged = (session: CoachingSession): SessionLoggedEvent =>
  createEvent(
    SESSION_LOGGED,
    {
      sessionId: session.id,
      organizationId: session.organizationId,
      engagementId: session.engagementId,
      sessionDate: session.sessionDate,
    },
    { tenantId: session.tenantId },
  );

// --- Professional learning activity ----------------------------------------------
export const ACTIVITY_PLANNED = "faculty.pd.planned";
export const ACTIVITY_COMPLETED = "faculty.pd.completed";

export interface ActivityEventPayload {
  readonly activityId: Uuid;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly category: string;
  readonly hours: number;
  readonly status: string;
}

export type ActivityPlannedEvent = DomainEvent<typeof ACTIVITY_PLANNED, ActivityEventPayload>;
export type ActivityCompletedEvent = DomainEvent<typeof ACTIVITY_COMPLETED, ActivityEventPayload>;

const activityPayload = (activity: ProfessionalLearningActivity): ActivityEventPayload => ({
  activityId: activity.id,
  organizationId: activity.organizationId,
  employeeId: activity.employeeId,
  category: activity.category,
  hours: activity.hours,
  status: activity.status,
});

export const activityPlanned = (activity: ProfessionalLearningActivity): ActivityPlannedEvent =>
  createEvent(ACTIVITY_PLANNED, activityPayload(activity), { tenantId: activity.tenantId });

export const activityCompleted = (activity: ProfessionalLearningActivity): ActivityCompletedEvent =>
  createEvent(ACTIVITY_COMPLETED, activityPayload(activity), { tenantId: activity.tenantId });
