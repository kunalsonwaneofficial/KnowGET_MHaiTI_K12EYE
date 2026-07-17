import { Module } from "@nestjs/common";
import { ObservabilityModule } from "./platform/observability/observability.module";
import { PlatformModule } from "./platform/platform.module";
import { SecurityModule } from "./platform/security/security.module";
import { ServicesModule } from "./platform/services/services.module";

/**
 * Root application module. Builds on the Platform Runtime Kernel (P1-M02), the
 * Security Foundation (P1-M04), the Shared Services platform (P1-M05) and the
 * Observability & DevOps platform (P1-M06); enterprise domain modules (Phase 2+)
 * are imported here as they are engineered.
 */
@Module({
  imports: [PlatformModule, SecurityModule, ServicesModule, ObservabilityModule],
})
export class AppModule {}
