import { MetricsRegistry } from "@knowget/metrics";
import { InMemorySpanExporter, Tracer } from "@knowget/tracing";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { lastValueFrom, of, throwError } from "rxjs";
import { describe, expect, it } from "vitest";
import { MetricsTracingInterceptor } from "./metrics-tracing.interceptor";

function ctx(method: string, url: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, url }) }),
  } as unknown as ExecutionContext;
}

function setup(): {
  interceptor: MetricsTracingInterceptor;
  registry: MetricsRegistry;
  exporter: InMemorySpanExporter;
} {
  const registry = new MetricsRegistry();
  const exporter = new InMemorySpanExporter();
  const interceptor = new MetricsTracingInterceptor(registry, new Tracer(exporter));
  return { interceptor, registry, exporter };
}

describe("MetricsTracingInterceptor", () => {
  it("records a request metric and span on success", async () => {
    const { interceptor, registry, exporter } = setup();
    const handler: CallHandler = { handle: () => of("result") };

    const result = await lastValueFrom(interceptor.intercept(ctx("GET", "/x"), handler));
    expect(result).toBe("result");

    const requests = registry.counter("http_requests_total", "", ["method", "outcome"]);
    expect(requests.get({ method: "GET", outcome: "ok" })).toBe(1);
    expect(exporter.spans).toHaveLength(1);
    expect(exporter.spans[0]?.name).toBe("GET /x");
    expect(exporter.spans[0]?.status).toBe("unset");
  });

  it("labels the request as errored and marks the span on failure", async () => {
    const { interceptor, registry, exporter } = setup();
    const handler: CallHandler = { handle: () => throwError(() => new Error("boom")) };

    await expect(lastValueFrom(interceptor.intercept(ctx("POST", "/y"), handler))).rejects.toThrow(
      "boom",
    );

    const requests = registry.counter("http_requests_total", "", ["method", "outcome"]);
    expect(requests.get({ method: "POST", outcome: "error" })).toBe(1);
    expect(exporter.spans[0]?.status).toBe("error");
  });
});
