import { createLogger, type Logger } from "@knowget/logging";
import { Injectable } from "@nestjs/common";

export interface HealthReport {
  readonly status: "ok";
  readonly service: string;
  readonly uptimeSeconds: number;
  readonly timestamp: string;
}

@Injectable()
export class HealthService {
  private readonly logger: Logger = createLogger({ base: { service: "api" } });

  check(): HealthReport {
    this.logger.debug("health check requested");
    return {
      status: "ok",
      service: "knowget-mhaiti-api",
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
