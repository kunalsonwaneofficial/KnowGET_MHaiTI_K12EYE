import { DatabaseHealthIndicator, type PrismaService } from "@knowget/database";
import type { Kernel } from "@knowget/kernel";
import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { DATABASE, KERNEL } from "../tokens";

/**
 * Bridges the NestJS application lifecycle to the platform {@link Kernel}: it
 * registers the self and database health indicators, starts the kernel (running
 * startup hooks and emitting ApplicationStarted) on bootstrap, and stops the
 * kernel and disconnects the database on graceful shutdown.
 */
@Injectable()
export class KernelLifecycleService implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(
    @Inject(KERNEL) private readonly kernel: Kernel,
    @Inject(DATABASE) private readonly database: PrismaService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.kernel.health.register({
      name: "self",
      kinds: ["liveness", "readiness", "startup"],
      check: () => ({ status: "up" }),
    });
    this.kernel.health.register(new DatabaseHealthIndicator(this.database));
    await this.kernel.start();
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    await this.kernel.stop(signal);
    await this.database.disconnect();
  }
}
