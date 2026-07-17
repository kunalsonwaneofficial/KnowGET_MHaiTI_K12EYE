import { runtimeContextStore, type RuntimeContextStore } from "@knowget/context";
import { type EventBus, InMemoryEventBus } from "@knowget/events";
import { HealthRegistry } from "@knowget/health";
import { createLogger, type Logger } from "@knowget/logging";
import { LifecycleManager } from "./lifecycle";
import { applicationStarted, applicationStopped } from "./runtime-events";
import { type ClockService, SystemClock } from "./services/clock";
import { type IdService, UuidIdService } from "./services/id-service";

export interface KernelOptions {
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly clock?: ClockService;
  readonly idService?: IdService;
  readonly healthRegistry?: HealthRegistry;
  readonly contextStore?: RuntimeContextStore;
}

/**
 * The platform runtime kernel: the framework-independent core that owns the
 * shared services, lifecycle, health, context, and event bus. Enterprise
 * capabilities plug into these facilities without modifying the kernel.
 */
export class Kernel {
  readonly logger: Logger;
  readonly eventBus: EventBus;
  readonly clock: ClockService;
  readonly ids: IdService;
  readonly health: HealthRegistry;
  readonly context: RuntimeContextStore;
  readonly lifecycle: LifecycleManager;

  constructor(options: KernelOptions = {}) {
    this.logger = options.logger ?? createLogger({ base: { component: "kernel" } });
    this.eventBus = options.eventBus ?? new InMemoryEventBus(this.logger);
    this.clock = options.clock ?? new SystemClock();
    this.ids = options.idService ?? new UuidIdService();
    this.health = options.healthRegistry ?? new HealthRegistry();
    this.context = options.contextStore ?? runtimeContextStore;
    this.lifecycle = new LifecycleManager(this.logger);
  }

  /** Run startup hooks and emit ApplicationStarted. */
  async start(): Promise<void> {
    const startedMs = this.clock.nowMs();
    await this.lifecycle.start();
    await this.eventBus.publish(
      applicationStarted({
        startedAt: this.clock.now(),
        durationMs: this.clock.nowMs() - startedMs,
      }),
    );
    this.logger.info("Platform kernel started");
  }

  /** Run shutdown hooks and emit ApplicationStopped. */
  async stop(reason?: string): Promise<void> {
    await this.lifecycle.stop();
    await this.eventBus.publish(applicationStopped(reason !== undefined ? { reason } : {}));
    this.logger.info("Platform kernel stopped", reason !== undefined ? { reason } : undefined);
  }
}

export const createKernel = (options?: KernelOptions): Kernel => new Kernel(options);
