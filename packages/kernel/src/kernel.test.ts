import { InMemoryEventBus } from "@knowget/events";
import { createLogger } from "@knowget/logging";
import { describe, expect, it, vi } from "vitest";
import { Kernel } from "./kernel";
import { RuntimeEventType } from "./runtime-events";

const silentLogger = createLogger({ level: "error", sink: () => undefined });

describe("Kernel", () => {
  it("emits ApplicationStarted on start and ApplicationStopped on stop", async () => {
    const eventBus = new InMemoryEventBus();
    const started = vi.fn();
    const stopped = vi.fn();
    eventBus.subscribe(RuntimeEventType.ApplicationStarted, started);
    eventBus.subscribe(RuntimeEventType.ApplicationStopped, stopped);

    const kernel = new Kernel({ eventBus, logger: silentLogger });
    await kernel.start();
    await kernel.stop("test");

    expect(started).toHaveBeenCalledOnce();
    expect(stopped).toHaveBeenCalledOnce();
  });

  it("runs registered lifecycle hooks during start", async () => {
    const kernel = new Kernel({ logger: silentLogger });
    const ran: string[] = [];
    kernel.lifecycle.onStartup("warm-cache", () => void ran.push("warm-cache"));
    await kernel.start();
    expect(ran).toEqual(["warm-cache"]);
    expect(kernel.lifecycle.currentState).toBe("started");
    await kernel.stop();
  });

  it("exposes kernel services and a health registry", () => {
    const kernel = new Kernel({ logger: silentLogger });
    expect(kernel.clock.now()).toMatch(/^\d{4}-/);
    expect(kernel.ids.newId()).toMatch(/^[0-9a-f-]{36}$/);
    expect(kernel.health).toBeDefined();
  });
});
