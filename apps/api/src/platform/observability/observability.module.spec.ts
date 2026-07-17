import "reflect-metadata";
import type { MetricsRegistry } from "@knowget/metrics";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { ObservabilityController } from "./observability.controller";
import { ObservabilityModule } from "./observability.module";
import { METRICS_REGISTRY } from "./observability.tokens";

describe("ObservabilityModule (integration)", () => {
  it("compiles the DI graph including the global interceptor", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ObservabilityModule] }).compile();
    expect(moduleRef.get(ObservabilityController)).toBeInstanceOf(ObservabilityController);
    await moduleRef.close();
  });

  it("exposes recorded metrics in Prometheus format", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ObservabilityModule] }).compile();
    const registry = moduleRef.get<MetricsRegistry>(METRICS_REGISTRY);
    registry.counter("widget_total", "Widgets made").inc({ kind: "a" }, 2);

    const text = moduleRef.get(ObservabilityController).metrics();
    expect(text).toContain("# TYPE widget_total counter");
    expect(text).toContain('widget_total{kind="a"} 2');
    await moduleRef.close();
  });

  it("produces a diagnostics snapshot with runtime and contributor sections", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ObservabilityModule] }).compile();
    const snapshot = moduleRef.get(ObservabilityController).diagnosticsSnapshot();
    expect(snapshot.runtime.pid).toBeGreaterThan(0);
    expect(snapshot.sections).toHaveProperty("metrics");
    expect(snapshot.sections).toHaveProperty("tracing");
    expect(snapshot.sections).toHaveProperty("alerts");
    await moduleRef.close();
  });
});
