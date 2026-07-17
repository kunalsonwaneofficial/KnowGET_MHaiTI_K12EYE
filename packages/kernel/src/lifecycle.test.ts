import { describe, expect, it } from "vitest";
import { LifecycleManager } from "./lifecycle";

describe("LifecycleManager", () => {
  it("runs startup hooks in order and shutdown hooks in reverse", async () => {
    const order: string[] = [];
    const lifecycle = new LifecycleManager();
    lifecycle.onStartup("a", () => void order.push("start:a"));
    lifecycle.onStartup("b", () => void order.push("start:b"));
    lifecycle.onShutdown("a", () => void order.push("stop:a"));
    lifecycle.onShutdown("b", () => void order.push("stop:b"));

    await lifecycle.start();
    expect(lifecycle.currentState).toBe("started");
    await lifecycle.stop();
    expect(lifecycle.currentState).toBe("stopped");
    expect(order).toEqual(["start:a", "start:b", "stop:b", "stop:a"]);
  });

  it("propagates startup errors (fail fast)", async () => {
    const lifecycle = new LifecycleManager();
    lifecycle.onStartup("boom", () => {
      throw new Error("startup failed");
    });
    await expect(lifecycle.start()).rejects.toThrow("startup failed");
  });

  it("isolates shutdown errors and still completes", async () => {
    const ran: string[] = [];
    const lifecycle = new LifecycleManager();
    lifecycle.onShutdown("bad", () => {
      throw new Error("cleanup failed");
    });
    lifecycle.onShutdown("good", () => void ran.push("good"));
    await lifecycle.start();
    await lifecycle.stop();
    expect(lifecycle.currentState).toBe("stopped");
    expect(ran).toContain("good");
  });

  it("rejects starting twice", async () => {
    const lifecycle = new LifecycleManager();
    await lifecycle.start();
    await expect(lifecycle.start()).rejects.toThrow("Cannot start lifecycle");
  });

  it("makes stop idempotent", async () => {
    const lifecycle = new LifecycleManager();
    await lifecycle.start();
    await lifecycle.stop();
    await expect(lifecycle.stop()).resolves.toBeUndefined();
  });
});
