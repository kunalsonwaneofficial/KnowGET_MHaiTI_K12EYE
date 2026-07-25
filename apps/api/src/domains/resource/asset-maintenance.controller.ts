import type { Principal } from "@knowget/auth";
import { type AssetMaintenance, AssetMaintenanceService } from "@knowget/resource";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ASSET_READ, ASSET_WRITE, parseBody, tenantOf } from "./resource-http";
import {
  cancelMaintenanceSchema,
  completeMaintenanceSchema,
  scheduleMaintenanceSchema,
  setMaintenanceScheduleSchema,
} from "./resource.dto";
import { RES_MAINTENANCE_SERVICE } from "./resource.tokens";

/** REST surface for asset maintenance (P2-D15). Gated by asset:*; tenant-scoped. */
@Controller("asset-maintenance")
export class AssetMaintenanceController {
  constructor(@Inject(RES_MAINTENANCE_SERVICE) private readonly service: AssetMaintenanceService) {}

  @RequirePermissions(ASSET_WRITE)
  @Post()
  @HttpCode(201)
  async schedule(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<AssetMaintenance> {
    const dto = parseBody(scheduleMaintenanceSchema, body);
    return this.service.schedule({
      tenantId: tenantOf(principal),
      assetId: dto.assetId as Uuid,
      description: dto.description,
      ...(dto.scheduledDate !== undefined ? { scheduledDate: dto.scheduledDate } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
    });
  }

  @RequirePermissions(ASSET_WRITE)
  @Post(":id/schedule")
  @HttpCode(200)
  async setSchedule(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AssetMaintenance> {
    const dto = parseBody(setMaintenanceScheduleSchema, body);
    return this.service.setSchedule(tenantOf(principal), id as Uuid, dto.scheduledDate);
  }

  @RequirePermissions(ASSET_WRITE)
  @Post(":id/complete")
  @HttpCode(200)
  async complete(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AssetMaintenance> {
    const dto = parseBody(completeMaintenanceSchema, body);
    return this.service.complete(tenantOf(principal), id as Uuid, {
      performedDate: dto.performedDate,
      ...(dto.costMinor !== undefined ? { costMinor: dto.costMinor } : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
    });
  }

  @RequirePermissions(ASSET_WRITE)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AssetMaintenance> {
    const dto = parseBody(cancelMaintenanceSchema, body);
    return this.service.cancel(tenantOf(principal), id as Uuid, dto.notes);
  }

  @RequirePermissions(ASSET_READ)
  @Get("by-asset/:assetId")
  async listForAsset(
    @CurrentPrincipal() principal: Principal,
    @Param("assetId") assetId: string,
  ): Promise<AssetMaintenance[]> {
    return this.service.listForAsset(tenantOf(principal), assetId as Uuid);
  }

  @RequirePermissions(ASSET_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AssetMaintenance> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
