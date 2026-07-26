import type { Principal } from "@knowget/auth";
import { type Sensor, SensorService } from "@knowget/facilities";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ENVIRONMENT_READ, ENVIRONMENT_WRITE, parseBody, tenantOf } from "./facilities-http";
import { installSensorSchema, setSensorUnitSchema } from "./facilities.dto";
import { FAC_SENSOR_SERVICE } from "./facilities.tokens";

/** REST surface for sensors (P2-D20). Gated by environment:*; tenant-scoped. */
@Controller("environment/sensors")
export class SensorController {
  constructor(@Inject(FAC_SENSOR_SERVICE) private readonly service: SensorService) {}

  @RequirePermissions(ENVIRONMENT_WRITE)
  @Post()
  @HttpCode(201)
  async install(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Sensor> {
    const dto = parseBody(installSensorSchema, body);
    return this.service.install({
      tenantId: tenantOf(principal),
      spaceId: dto.spaceId as Uuid,
      code: dto.code,
      metric: dto.metric,
      unit: dto.unit,
    });
  }

  @RequirePermissions(ENVIRONMENT_WRITE)
  @Post(":id/unit")
  @HttpCode(200)
  async setUnit(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Sensor> {
    const dto = parseBody(setSensorUnitSchema, body);
    return this.service.setUnit(tenantOf(principal), id as Uuid, dto.unit);
  }

  @RequirePermissions(ENVIRONMENT_WRITE)
  @Post(":id/deactivate")
  @HttpCode(200)
  async deactivate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Sensor> {
    return this.service.deactivate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ENVIRONMENT_WRITE)
  @Post(":id/reactivate")
  @HttpCode(200)
  async reactivate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Sensor> {
    return this.service.reactivate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ENVIRONMENT_WRITE)
  @Post(":id/retire")
  @HttpCode(200)
  async retire(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Sensor> {
    return this.service.retire(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ENVIRONMENT_READ)
  @Get("by-space/:spaceId")
  async listForSpace(
    @CurrentPrincipal() principal: Principal,
    @Param("spaceId") spaceId: string,
  ): Promise<Sensor[]> {
    return this.service.listForSpace(tenantOf(principal), spaceId as Uuid);
  }

  @RequirePermissions(ENVIRONMENT_READ)
  @Get("by-building/:buildingId")
  async listForBuilding(
    @CurrentPrincipal() principal: Principal,
    @Param("buildingId") buildingId: string,
  ): Promise<Sensor[]> {
    return this.service.listForBuilding(tenantOf(principal), buildingId as Uuid);
  }

  @RequirePermissions(ENVIRONMENT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Sensor[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(ENVIRONMENT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Sensor> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
