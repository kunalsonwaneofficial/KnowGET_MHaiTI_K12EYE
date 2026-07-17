import { describe, expect, it } from "vitest";
import { Counter, Gauge, Histogram } from "./instruments";
import { labelKey } from "./metric";
import { MetricsRegistry } from "./registry";

describe("labelKey", () => {
  it("is order-independent", () => {
    expect(labelKey({ a: "1", b: "2" })).toBe(labelKey({ b: "2", a: "1" }));
    expect(labelKey({})).toBe("");
  });
});

describe("Counter", () => {
  it("accumulates and rejects negative increments", () => {
    const c = new Counter("hits", "hits");
    c.inc();
    c.inc({ route: "/a" }, 4);
    expect(c.get()).toBe(1);
    expect(c.get({ route: "/a" })).toBe(4);
    expect(() => c.inc({}, -1)).toThrow();
  });
});

describe("Gauge", () => {
  it("moves up and down", () => {
    const g = new Gauge("inflight", "in flight");
    g.set(5);
    g.inc();
    g.dec({}, 2);
    expect(g.get()).toBe(4);
  });
});

describe("Histogram", () => {
  it("buckets observations cumulatively with sum and count", () => {
    const h = new Histogram("latency", "latency", [0.1, 0.5, 1]);
    h.observe(0.05);
    h.observe(0.2);
    h.observe(2);
    const samples = h.collect();
    const bucket = (le: string): number =>
      samples.find((s) => s.name === "latency_bucket" && s.labels.le === le)?.value ?? -1;
    expect(bucket("0.1")).toBe(1);
    expect(bucket("0.5")).toBe(2);
    expect(bucket("+Inf")).toBe(3);
    expect(samples.find((s) => s.name === "latency_sum")?.value).toBeCloseTo(2.25);
    expect(samples.find((s) => s.name === "latency_count")?.value).toBe(3);
  });
});

describe("MetricsRegistry", () => {
  it("is create-or-get by name and rejects type conflicts", () => {
    const registry = new MetricsRegistry();
    const a = registry.counter("c", "c");
    const b = registry.counter("c", "c");
    expect(a).toBe(b);
    expect(() => registry.gauge("c", "c")).toThrow();
  });

  it("exposes Prometheus text format", () => {
    const registry = new MetricsRegistry();
    registry.counter("requests_total", "Total requests").inc({ method: "GET" }, 3);
    const text = registry.expose();
    expect(text).toContain("# HELP requests_total Total requests");
    expect(text).toContain("# TYPE requests_total counter");
    expect(text).toContain('requests_total{method="GET"} 3');
  });
});
