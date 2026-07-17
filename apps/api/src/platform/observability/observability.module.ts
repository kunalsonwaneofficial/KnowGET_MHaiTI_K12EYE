import { type AlertRule, AlertManager } from "@knowget/alerting";
import { DiagnosticsProvider } from "@knowget/diagnostics";
import { MetricsRegistry } from "@knowget/metrics";
import { InMemorySpanExporter, Tracer } from "@knowget/tracing";
import { Global, Module, type Provider } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { MetricsTracingInterceptor } from "./metrics-tracing.interceptor";
import { ObservabilityController } from "./observability.controller";
import {
  ALERT_MANAGER,
  DIAGNOSTICS,
  METRICS_REGISTRY,
  SPAN_EXPORTER,
  TRACER,
} from "./observability.tokens";

/** Baseline platform alert rules; domains extend these. */
const DEFAULT_ALERT_RULES: readonly AlertRule[] = [
  {
    name: "heap-pressure",
    metric: "heap_used_ratio",
    comparator: "gt",
    threshold: 0.95,
    severity: "critical",
    description: "Heap usage exceeds 95% of the heap total",
  },
];

/** Assemble the diagnostics provider with live subsystem contributors. */
function buildDiagnostics(
  registry: MetricsRegistry,
  exporter: InMemorySpanExporter,
  alerts: AlertManager,
): DiagnosticsProvider {
  const provider = new DiagnosticsProvider();
  provider.register("metrics", () => ({ instruments: registry.collect().length }));
  provider.register("tracing", () => ({ exportedSpans: exporter.spans.length }));
  provider.register("alerts", () => {
    const memory = process.memoryUsage();
    const heapUsedRatio = memory.heapTotal > 0 ? memory.heapUsed / memory.heapTotal : 0;
    return { active: alerts.evaluate({ heap_used_ratio: heapUsedRatio }) };
  });
  return provider;
}

const providers: Provider[] = [
  { provide: METRICS_REGISTRY, useFactory: () => new MetricsRegistry() },
  { provide: SPAN_EXPORTER, useFactory: () => new InMemorySpanExporter() },
  {
    provide: TRACER,
    useFactory: (exporter: InMemorySpanExporter) => new Tracer(exporter),
    inject: [SPAN_EXPORTER],
  },
  { provide: ALERT_MANAGER, useFactory: () => new AlertManager(DEFAULT_ALERT_RULES) },
  {
    provide: DIAGNOSTICS,
    useFactory: (registry: MetricsRegistry, exporter: InMemorySpanExporter, alerts: AlertManager) =>
      buildDiagnostics(registry, exporter, alerts),
    inject: [METRICS_REGISTRY, SPAN_EXPORTER, ALERT_MANAGER],
  },
  { provide: APP_INTERCEPTOR, useClass: MetricsTracingInterceptor },
];

/**
 * The Observability & DevOps (EODP) layer (P1-M06). Provides the metrics
 * registry, tracer + span exporter, alert manager and diagnostics provider via
 * DI; installs a global interceptor that records request metrics and a span per
 * request; and exposes `/metrics` (Prometheus) and `/diagnostics`. In-memory
 * defaults; OTLP/Prometheus-remote/APM backends slot in behind the same seams.
 */
@Global()
@Module({
  controllers: [ObservabilityController],
  providers,
  exports: [METRICS_REGISTRY, TRACER, SPAN_EXPORTER, ALERT_MANAGER, DIAGNOSTICS],
})
export class ObservabilityModule {}
