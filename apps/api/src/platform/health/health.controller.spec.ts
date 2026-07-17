import { HealthRegistry } from "@knowget/health";
import type { Kernel } from "@knowget/kernel";
import { describe, expect, it, vi } from "vitest";
import { HealthController } from "./health.controller";

function makeController(registry: HealthRegistry): HealthController {
  return new HealthController({ health: registry } as unknown as Kernel);
}

describe("HealthController", () => {
  it("returns an up report with HTTP 200 when healthy", async () => {
    const registry = new HealthRegistry();
    registry.register({ name: "self", check: () => ({ status: "up" }) });
    const res = { status: vi.fn() };
    const report = await makeController(registry).readiness(res);
    expect(report.status).toBe("up");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns HTTP 503 when a dependency is down", async () => {
    const registry = new HealthRegistry();
    registry.register({ name: "db", check: () => ({ status: "down" }) });
    const res = { status: vi.fn() };
    const report = await makeController(registry).readiness(res);
    expect(report.status).toBe("down");
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it("reports liveness up for an empty registry", async () => {
    const report = await makeController(new HealthRegistry()).liveness();
    expect(report.status).toBe("up");
  });
});
