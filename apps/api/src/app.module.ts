import { Module } from "@nestjs/common";
import { PlatformModule } from "./platform/platform.module";
import { SecurityModule } from "./platform/security/security.module";

/**
 * Root application module. Builds on the Platform Runtime Kernel (P1-M02) and
 * the Security Foundation (P1-M04); enterprise domain modules (Phase 2+) are
 * imported here as they are engineered.
 */
@Module({
  imports: [PlatformModule, SecurityModule],
})
export class AppModule {}
