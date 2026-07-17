import { Module } from "@nestjs/common";
import { PlatformModule } from "./platform/platform.module";

/**
 * Root application module. Builds on the Platform Runtime Kernel (P1-M02);
 * enterprise domain modules (Phase 2+) are imported here as they are engineered.
 */
@Module({
  imports: [PlatformModule],
})
export class AppModule {}
