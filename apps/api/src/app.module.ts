import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";

/**
 * Root application module. The Platform Runtime Kernel (P1-M02) expands this
 * into a fully modular, DI-driven runtime; for P1-M01 it wires the health check
 * used by container/orchestration probes and CI smoke tests.
 */
@Module({
  imports: [HealthModule],
})
export class AppModule {}
