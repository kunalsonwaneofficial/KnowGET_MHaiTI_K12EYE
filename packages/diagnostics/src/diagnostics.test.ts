import { describe, expect, it } from "vitest";
import { DiagnosticsProvider } from "./diagnostics";
import type { RuntimeInfo, RuntimeSource } from "./runtime-source";

const fixedRuntime: RuntimeInfo = {
  nodeVersion: "v22.0.0",
  platform: "linux",
  pid: 1234,
  uptimeSeconds: 42,
  memory: { rssBytes: 100, heapUsedBytes: 50, heapTotalBytes: 80 },
};

const fixedSource: RuntimeSource = { read: () => fixedRuntime };

describe("DiagnosticsProvider", () => {
  it("captures runtime facts and a fixed timestamp", () => {
    const provider = new DiagnosticsProvider({
      source: fixedSource,
      now: () => "2026-07-17T00:00:00.000Z" as never,
    });
    const snapshot = provider.snapshot();
    expect(snapshot.runtime).toEqual(fixedRuntime);
    expect(snapshot.timestamp).toBe("2026-07-17T00:00:00.000Z");
    expect(snapshot.sections).toEqual({});
  });

  it("includes registered contributor sections", () => {
    const provider = new DiagnosticsProvider({ source: fixedSource });
    provider.register("health", () => ({ status: "up" }));
    provider.register("metrics", () => ({ instruments: 7 }));
    const snapshot = provider.snapshot();
    expect(snapshot.sections.health).toEqual({ status: "up" });
    expect(snapshot.sections.metrics).toEqual({ instruments: 7 });
  });

  it("reads live runtime facts from the default node source", () => {
    const snapshot = new DiagnosticsProvider().snapshot();
    expect(snapshot.runtime.pid).toBeGreaterThan(0);
    expect(snapshot.runtime.nodeVersion).toMatch(/^v\d+/);
    expect(snapshot.runtime.memory.rssBytes).toBeGreaterThan(0);
  });
});
