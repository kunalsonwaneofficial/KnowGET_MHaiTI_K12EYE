import { describe, expect, it } from "vitest";
import { InMemorySpanExporter, Tracer } from "./tracer";

function fixedTracer(): { tracer: Tracer; exporter: InMemorySpanExporter; tick: () => void } {
  let now = 0;
  let counter = 0;
  const exporter = new InMemorySpanExporter();
  const tracer = new Tracer(exporter, {
    clock: () => now,
    idGenerator: () => `id-${(counter += 1)}`,
  });
  return { tracer, exporter, tick: () => (now += 10) };
}

describe("Tracer", () => {
  it("records a span with duration, attributes, events and status", () => {
    const { tracer, exporter, tick } = fixedTracer();
    const span = tracer.startSpan("op", { attributes: { component: "test" } });
    span.setAttribute("db.rows", 3).addEvent("queried").setStatus("ok");
    tick();
    const finished = span.end();

    expect(finished.durationMs).toBe(10);
    expect(finished.status).toBe("ok");
    expect(finished.attributes).toMatchObject({ component: "test", "db.rows": 3 });
    expect(finished.events[0]?.name).toBe("queried");
    expect(exporter.spans).toHaveLength(1);
  });

  it("starts a new trace for a root span", () => {
    const { tracer } = fixedTracer();
    const span = tracer.startSpan("root");
    expect(span.context.traceId).toBe("id-1");
    expect(span.context.spanId).toBe("id-2");
    expect(span.context.parentSpanId).toBeUndefined();
  });

  it("adopts an inbound trace id for a root span", () => {
    const { tracer } = fixedTracer();
    const span = tracer.startSpan("root", { traceId: "inbound-trace" });
    expect(span.context.traceId).toBe("inbound-trace");
  });

  it("continues the parent trace for a child span", () => {
    const { tracer } = fixedTracer();
    const parent = tracer.startSpan("parent");
    const child = tracer.startSpan("child", { parent: parent.context });
    expect(child.context.traceId).toBe(parent.context.traceId);
    expect(child.context.parentSpanId).toBe(parent.context.spanId);
  });

  it("is idempotent on end and ignores post-end mutation", () => {
    const { tracer, exporter } = fixedTracer();
    const span = tracer.startSpan("op");
    const first = span.end();
    span.setAttribute("late", "value");
    const second = span.end();
    expect(first).toBe(second);
    expect(span.ended).toBe(true);
    expect(exporter.spans).toHaveLength(1);
    expect(first.attributes.late).toBeUndefined();
  });
});
