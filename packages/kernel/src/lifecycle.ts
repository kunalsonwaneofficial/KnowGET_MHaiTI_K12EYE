import type { Logger } from "@knowget/logging";

export type LifecycleHook = () => void | Promise<void>;

export type LifecycleState = "created" | "starting" | "started" | "stopping" | "stopped";

interface HookRegistration {
  readonly name: string;
  readonly hook: LifecycleHook;
}

/**
 * Orders startup and shutdown work. Startup hooks run in registration order and
 * fail fast; shutdown hooks run in reverse (LIFO) with error isolation so a
 * single failing cleanup never blocks the rest.
 */
export class LifecycleManager {
  private state: LifecycleState = "created";
  private readonly startupHooks: HookRegistration[] = [];
  private readonly shutdownHooks: HookRegistration[] = [];

  constructor(private readonly logger?: Logger) {}

  get currentState(): LifecycleState {
    return this.state;
  }

  onStartup(name: string, hook: LifecycleHook): void {
    this.startupHooks.push({ name, hook });
  }

  onShutdown(name: string, hook: LifecycleHook): void {
    this.shutdownHooks.push({ name, hook });
  }

  async start(): Promise<void> {
    if (this.state !== "created") {
      throw new Error(`Cannot start lifecycle from state: ${this.state}`);
    }
    this.state = "starting";
    for (const { name, hook } of this.startupHooks) {
      this.logger?.debug("Running startup hook", { hook: name });
      await hook();
    }
    this.state = "started";
  }

  async stop(): Promise<void> {
    if (this.state === "stopped" || this.state === "stopping") {
      return;
    }
    this.state = "stopping";
    for (const { name, hook } of [...this.shutdownHooks].reverse()) {
      this.logger?.debug("Running shutdown hook", { hook: name });
      try {
        await hook();
      } catch (error) {
        this.logger?.error("Shutdown hook failed", {
          hook: name,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.state = "stopped";
  }
}
