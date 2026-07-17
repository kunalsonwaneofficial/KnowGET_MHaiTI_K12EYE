import type { Kernel } from "@knowget/kernel";
import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { KERNEL } from "../tokens";

/**
 * Bridges the NestJS application lifecycle to the platform {@link Kernel}: it
 * registers a self health indicator, starts the kernel (running startup hooks
 * and emitting ApplicationStarted) on bootstrap, and stops it (running shutdown
 * hooks and emitting ApplicationStopped) on graceful shutdown.
 */
@Injectable()
export class KernelLifecycleService implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(@Inject(KERNEL) private readonly kernel: Kernel) {}

  async onApplicationBootstrap(): Promise<void> {
    this.kernel.health.register({
      name: "self",
      kinds: ["liveness", "readiness", "startup"],
      check: () => ({ status: "up" }),
    });
    await this.kernel.start();
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    await this.kernel.stop(signal);
  }
}
