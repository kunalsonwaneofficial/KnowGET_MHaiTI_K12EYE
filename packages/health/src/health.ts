import type { ISODateString } from "@knowget/types";

/** Health state of a component or the platform overall. */
export type HealthState = "up" | "down" | "degraded";

/** Which probe(s) an indicator participates in. */
export type HealthKind = "liveness" | "readiness" | "startup";

export interface HealthCheckResult {
  readonly status: HealthState;
  readonly detail?: string;
  readonly data?: Record<string, unknown>;
}

/**
 * A single health check. Later milestones register indicators here (e.g. the
 * database check in P1-M03) without modifying the framework.
 */
export interface HealthIndicator {
  readonly name: string;
  /** Probes this indicator contributes to. Defaults to `["readiness"]`. */
  readonly kinds?: readonly HealthKind[];
  check(): Promise<HealthCheckResult> | HealthCheckResult;
}

/** Aggregated, machine-readable health report. */
export interface HealthReport {
  readonly status: HealthState;
  readonly checks: Record<string, HealthCheckResult>;
  readonly timestamp: ISODateString;
}

/** Roll up individual results: any `down` → down; else any `degraded` → degraded. */
export function aggregateHealth(results: readonly HealthCheckResult[]): HealthState {
  if (results.some((r) => r.status === "down")) {
    return "down";
  }
  if (results.some((r) => r.status === "degraded")) {
    return "degraded";
  }
  return "up";
}
