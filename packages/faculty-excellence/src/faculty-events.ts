import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { CompetencyFramework } from "./competency-framework";
import type { Observation } from "./observation";

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
