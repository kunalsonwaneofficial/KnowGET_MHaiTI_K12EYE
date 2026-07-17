import type { HealthReport } from "@knowget/health";
import type { Kernel } from "@knowget/kernel";
import { Controller, Get, Inject, Res } from "@nestjs/common";
import { Public } from "../security/decorators";
import { KERNEL } from "../tokens";

interface StatusSettable {
  status(code: number): unknown;
}

/**
 * Kubernetes-style health probes backed by the kernel's health registry.
 * `down` maps to HTTP 503 so orchestrators can act; `up`/`degraded` return 200.
 */
@Public()
@Controller("health")
export class HealthController {
  constructor(@Inject(KERNEL) private readonly kernel: Kernel) {}

  @Get()
  readiness(@Res({ passthrough: true }) res: StatusSettable): Promise<HealthReport> {
    return this.withStatus(this.kernel.health.checkReadiness(), res);
  }

  @Get("live")
  liveness(): Promise<HealthReport> {
    return this.kernel.health.checkLiveness();
  }

  @Get("ready")
  ready(@Res({ passthrough: true }) res: StatusSettable): Promise<HealthReport> {
    return this.withStatus(this.kernel.health.checkReadiness(), res);
  }

  @Get("startup")
  startup(@Res({ passthrough: true }) res: StatusSettable): Promise<HealthReport> {
    return this.withStatus(this.kernel.health.checkStartup(), res);
  }

  private async withStatus(
    reportPromise: Promise<HealthReport>,
    res: StatusSettable,
  ): Promise<HealthReport> {
    const report = await reportPromise;
    res.status(report.status === "down" ? 503 : 200);
    return report;
  }
}
