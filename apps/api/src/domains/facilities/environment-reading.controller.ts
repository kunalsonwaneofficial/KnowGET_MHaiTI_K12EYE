import type { Principal } from "@knowget/auth";
import { type EnvironmentReading, EnvironmentReadingService } from "@knowget/facilities";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ENVIRONMENT_READ, ENVIRONMENT_WRITE, parseBody, tenantOf } from "./facilities-http";
import { recordReadingSchema } from "./facilities.dto";
import { FAC_READING_SERVICE } from "./facilities.tokens";

/** REST surface for environment readings (P2-D20). Gated by environment:*; tenant-scoped. Append-only. */
@Controller("environment/readings")
export class EnvironmentReadingController {
  constructor(@Inject(FAC_READING_SERVICE) private readonly service: EnvironmentReadingService) {}

  @RequirePermissions(ENVIRONMENT_WRITE)
  @Post()
  @HttpCode(201)
  async record(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<EnvironmentReading> {
    const dto = parseBody(recordReadingSchema, body);
    return this.service.record({
      tenantId: tenantOf(principal),
      sensorId: dto.sensorId as Uuid,
      value: dto.value,
      unit: dto.unit,
      recordedAt: dto.recordedAt,
    });
  }

  @RequirePermissions(ENVIRONMENT_READ)
  @Get("by-space/:spaceId/latest")
  async latestForSpace(
    @CurrentPrincipal() principal: Principal,
    @Param("spaceId") spaceId: string,
  ): Promise<EnvironmentReading[]> {
    return this.service.latestForSpace(tenantOf(principal), spaceId as Uuid);
  }

  @RequirePermissions(ENVIRONMENT_READ)
  @Get("by-space/:spaceId")
  async listForSpace(
    @CurrentPrincipal() principal: Principal,
    @Param("spaceId") spaceId: string,
  ): Promise<EnvironmentReading[]> {
    return this.service.listForSpace(tenantOf(principal), spaceId as Uuid);
  }

  @RequirePermissions(ENVIRONMENT_READ)
  @Get("by-sensor/:sensorId")
  async listForSensor(
    @CurrentPrincipal() principal: Principal,
    @Param("sensorId") sensorId: string,
  ): Promise<EnvironmentReading[]> {
    return this.service.listForSensor(tenantOf(principal), sensorId as Uuid);
  }

  @RequirePermissions(ENVIRONMENT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<EnvironmentReading | null> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
