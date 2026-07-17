import { createEvent } from "@knowget/events";
import type { DomainEvent } from "@knowget/types";

/**
 * Platform runtime events (not business events). Emitted by the kernel so that
 * observability and future orchestration can react to platform lifecycle.
 */
export const RuntimeEventType = {
  ApplicationStarted: "platform.application.started",
  ApplicationStopped: "platform.application.stopped",
  ModuleLoaded: "platform.module.loaded",
  ConfigurationLoaded: "platform.configuration.loaded",
  HealthChanged: "platform.health.changed",
} as const;

export interface ApplicationStartedPayload {
  readonly startedAt: string;
  readonly durationMs: number;
}
export interface ApplicationStoppedPayload {
  readonly reason?: string;
}
export interface ModuleLoadedPayload {
  readonly module: string;
}
export interface ConfigurationLoadedPayload {
  readonly keys: readonly string[];
}
export interface HealthChangedPayload {
  readonly previous: string;
  readonly current: string;
}

export const applicationStarted = (
  payload: ApplicationStartedPayload,
): DomainEvent<typeof RuntimeEventType.ApplicationStarted, ApplicationStartedPayload> =>
  createEvent(RuntimeEventType.ApplicationStarted, payload);

export const applicationStopped = (
  payload: ApplicationStoppedPayload = {},
): DomainEvent<typeof RuntimeEventType.ApplicationStopped, ApplicationStoppedPayload> =>
  createEvent(RuntimeEventType.ApplicationStopped, payload);

export const moduleLoaded = (
  payload: ModuleLoadedPayload,
): DomainEvent<typeof RuntimeEventType.ModuleLoaded, ModuleLoadedPayload> =>
  createEvent(RuntimeEventType.ModuleLoaded, payload);

export const configurationLoaded = (
  payload: ConfigurationLoadedPayload,
): DomainEvent<typeof RuntimeEventType.ConfigurationLoaded, ConfigurationLoadedPayload> =>
  createEvent(RuntimeEventType.ConfigurationLoaded, payload);

export const healthChanged = (
  payload: HealthChangedPayload,
): DomainEvent<typeof RuntimeEventType.HealthChanged, HealthChangedPayload> =>
  createEvent(RuntimeEventType.HealthChanged, payload);
