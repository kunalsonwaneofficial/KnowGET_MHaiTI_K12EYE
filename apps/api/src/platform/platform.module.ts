import { StaticFeatureFlagService } from "@knowget/configuration";
import { createKernel } from "@knowget/kernel";
import { Global, Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { loadAppConfig } from "./config/app-config";
import { AllExceptionsFilter } from "./errors/all-exceptions.filter";
import { HealthController } from "./health/health.controller";
import { KernelLifecycleService } from "./runtime/kernel-lifecycle.service";
import { APP_CONFIG, FEATURE_FLAGS, KERNEL } from "./tokens";

/**
 * The platform runtime module. Provides the single {@link Kernel} instance and
 * its services to the whole application (Global), exposes health probes, wires
 * the global error boundary, and drives kernel start/stop via the app
 * lifecycle. Enterprise modules build on these facilities without touching the
 * kernel.
 */
@Global()
@Module({
  controllers: [HealthController],
  providers: [
    { provide: KERNEL, useFactory: () => createKernel() },
    { provide: APP_CONFIG, useFactory: () => loadAppConfig() },
    { provide: FEATURE_FLAGS, useFactory: () => new StaticFeatureFlagService() },
    KernelLifecycleService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
  exports: [KERNEL, APP_CONFIG, FEATURE_FLAGS],
})
export class PlatformModule {}
