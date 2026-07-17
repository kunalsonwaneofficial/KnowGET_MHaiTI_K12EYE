import { Controller, Get } from "@nestjs/common";
import { type HealthReport, HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check(): HealthReport {
    return this.healthService.check();
  }
}
