import { describe, expect, it } from "vitest";
import { aggregateHealth, type HealthIndicator } from "./health";
import { HealthRegistry } from "./health-registry";

const indicator = (
  name: string,
  status: "up" | "down" | "degraded",
  kinds?: HealthIndicator["kinds"],
): HealthIndicator => ({ name, kinds, check: () => ({ status }) });

describe("aggregateHealth", () => {
  it("prioritizes down over degraded over up", () => {
    expect(aggregateHealth([{ status: "up" }, { status: "degraded" }])).toBe("degraded");
    expect(aggregateHealth([{ status: "degraded" }, { status: "down" }])).toBe("down");
    expect(aggregateHealth([{ status: "up" }])).toBe("up");
    expect(aggregateHealth([])).toBe("up");
  });
});

describe("HealthRegistry", () => {
  it("aggregates readiness of all registered indicators", async () => {
    const registry = new HealthRegistry();
    registry.register(indicator("cache", "up"));
    registry.register(indicator("queue", "degraded"));
    const report = await registry.checkReadiness();
    expect(report.status).toBe("degraded");
    expect(Object.keys(report.checks)).toEqual(["cache", "queue"]);
    expect(report.timestamp).toMatch(/^\d{4}-/);
  });

  it("captures a throwing indicator as down", async () => {
    const registry = new HealthRegistry();
    registry.register({
      name: "flaky",
      check: () => {
        throw new Error("kaboom");
      },
    });
    const report = await registry.checkReadiness();
    expect(report.status).toBe("down");
    expect(report.checks.flaky?.detail).toBe("kaboom");
  });

  it("filters indicators by probe kind", async () => {
    const registry = new HealthRegistry();
    registry.register(indicator("live", "up", ["liveness"]));
    registry.register(indicator("ready", "down", ["readiness"]));
    expect((await registry.checkLiveness()).status).toBe("up");
    expect((await registry.checkReadiness()).status).toBe("down");
  });

  it("rejects duplicate registration", () => {
    const registry = new HealthRegistry();
    registry.register(indicator("dup", "up"));
    expect(() => registry.register(indicator("dup", "up"))).toThrow("already registered");
  });
});
