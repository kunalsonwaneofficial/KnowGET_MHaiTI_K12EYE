import type { DiagnosticsProvider, DiagnosticsSnapshot } from "@knowget/diagnostics";
import type { MetricsRegistry } from "@knowget/metrics";
import { Controller, Get, Header, Inject } from "@nestjs/common";
import { Public } from "../security/decorators";
import { DIAGNOSTICS, METRICS_REGISTRY } from "./observability.tokens";

/**
 * Observability endpoints: a Prometheus scrape target and a diagnostics
 * snapshot. Both are public so scrapers and health tooling can reach them
 * without credentials (network-restrict in production).
 */
@Public()
@Controller()
export class ObservabilityController {
  constructor(
    @Inject(METRICS_REGISTRY) private readonly registry: MetricsRegistry,
    @Inject(DIAGNOSTICS) private readonly diagnostics: DiagnosticsProvider,
  ) {}

  @Get("metrics")
  @Header("Content-Type", "text/plain; version=0.0.4")
  metrics(): string {
    return this.registry.expose();
  }

  @Get("diagnostics")
  diagnosticsSnapshot(): DiagnosticsSnapshot {
    return this.diagnostics.snapshot();
  }
}
