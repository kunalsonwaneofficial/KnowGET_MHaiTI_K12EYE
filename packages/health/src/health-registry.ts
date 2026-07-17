import { nowIso } from "@knowget/shared";
import {
  aggregateHealth,
  type HealthCheckResult,
  type HealthIndicator,
  type HealthKind,
  type HealthReport,
} from "./health";

const DEFAULT_KINDS: readonly HealthKind[] = ["readiness"];

/** Registry of health indicators with per-probe aggregation. */
export class HealthRegistry {
  private readonly indicators = new Map<string, HealthIndicator>();

  register(indicator: HealthIndicator): void {
    if (this.indicators.has(indicator.name)) {
      throw new Error(`Health indicator already registered: ${indicator.name}`);
    }
    this.indicators.set(indicator.name, indicator);
  }

  unregister(name: string): void {
    this.indicators.delete(name);
  }

  /** Run all indicators for a probe kind and produce an aggregated report. */
  async check(kind: HealthKind = "readiness"): Promise<HealthReport> {
    const relevant = [...this.indicators.values()].filter((indicator) =>
      (indicator.kinds ?? DEFAULT_KINDS).includes(kind),
    );

    const checks: Record<string, HealthCheckResult> = {};
    for (const indicator of relevant) {
      try {
        checks[indicator.name] = await indicator.check();
      } catch (error) {
        checks[indicator.name] = {
          status: "down",
          detail: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return {
      status: aggregateHealth(Object.values(checks)),
      checks,
      timestamp: nowIso(),
    };
  }

  checkLiveness(): Promise<HealthReport> {
    return this.check("liveness");
  }

  checkReadiness(): Promise<HealthReport> {
    return this.check("readiness");
  }

  checkStartup(): Promise<HealthReport> {
    return this.check("startup");
  }
}
