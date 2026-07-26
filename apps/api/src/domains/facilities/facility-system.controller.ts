import type { Principal } from "@knowget/auth";
import {
  type FacilitySystem,
  FacilitySystemService,
  type ServiceStatus,
} from "@knowget/facilities";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { FACILITIES_READ, FACILITIES_WRITE, parseBody, tenantOf } from "./facilities-http";
import { commissionSystemSchema, recordServiceSchema, setIntervalSchema } from "./facilities.dto";
import { FAC_SYSTEM_SERVICE } from "./facilities.tokens";

/** REST surface for facility systems (P2-D20). Gated by facilities:*; tenant-scoped. */
@Controller("facilities/systems")
export class FacilitySystemController {
  constructor(@Inject(FAC_SYSTEM_SERVICE) private readonly service: FacilitySystemService) {}

  @RequirePermissions(FACILITIES_WRITE)
  @Post()
  @HttpCode(201)
  async commission(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<FacilitySystem> {
    const dto = parseBody(commissionSystemSchema, body);
    return this.service.commission({
      tenantId: tenantOf(principal),
      buildingId: dto.buildingId as Uuid,
      code: dto.code,
      type: dto.type,
      commissionedOn: dto.commissionedOn,
      serviceIntervalDays: dto.serviceIntervalDays,
      lastServicedOn: dto.lastServicedOn,
    });
  }

  @RequirePermissions(FACILITIES_WRITE)
  @Post(":id/record-service")
  @HttpCode(200)
  async recordService(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<FacilitySystem> {
    const dto = parseBody(recordServiceSchema, body);
    return this.service.recordService(tenantOf(principal), id as Uuid, dto.servicedOn);
  }

  @RequirePermissions(FACILITIES_WRITE)
  @Post(":id/interval")
  @HttpCode(200)
  async setInterval(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<FacilitySystem> {
    const dto = parseBody(setIntervalSchema, body);
    return this.service.setInterval(tenantOf(principal), id as Uuid, dto.days);
  }

  @RequirePermissions(FACILITIES_WRITE)
  @Post(":id/send-to-maintenance")
  @HttpCode(200)
  async sendToMaintenance(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<FacilitySystem> {
    return this.service.sendToMaintenance(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FACILITIES_WRITE)
  @Post(":id/return-to-service")
  @HttpCode(200)
  async returnToService(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<FacilitySystem> {
    return this.service.returnToService(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FACILITIES_WRITE)
  @Post(":id/decommission")
  @HttpCode(200)
  async decommission(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<FacilitySystem> {
    return this.service.decommission(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FACILITIES_READ)
  @Get(":id/service-status/:asOfDate")
  async serviceStatus(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("asOfDate") asOfDate: string,
    @Query("warningDays") warningDays?: string,
  ): Promise<ServiceStatus> {
    const parsed = warningDays !== undefined ? Number(warningDays) : undefined;
    const days = parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined;
    return this.service.serviceStatus(tenantOf(principal), id as Uuid, asOfDate, days);
  }

  @RequirePermissions(FACILITIES_READ)
  @Get("by-building/:buildingId")
  async listForBuilding(
    @CurrentPrincipal() principal: Principal,
    @Param("buildingId") buildingId: string,
  ): Promise<FacilitySystem[]> {
    return this.service.listForBuilding(tenantOf(principal), buildingId as Uuid);
  }

  @RequirePermissions(FACILITIES_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<FacilitySystem[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(FACILITIES_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<FacilitySystem> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
