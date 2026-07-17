import type { HealthCheckResult, HealthIndicator, HealthKind } from "@knowget/health";
import type { PrismaService } from "./prisma-service";

/** Health indicator that verifies database connectivity (readiness/startup). */
export class DatabaseHealthIndicator implements HealthIndicator {
  readonly name = "database";
  readonly kinds: readonly HealthKind[] = ["readiness", "startup"];

  constructor(private readonly service: PrismaService) {}

  async check(): Promise<HealthCheckResult> {
    const healthy = await this.service.isHealthy();
    return healthy ? { status: "up" } : { status: "down", detail: "database unreachable" };
  }
}
