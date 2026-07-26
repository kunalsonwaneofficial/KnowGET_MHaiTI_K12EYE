import type { Principal } from "@knowget/auth";
import { type MaintenanceOrder, MaintenanceOrderService } from "@knowget/facilities";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { FACILITIES_READ, FACILITIES_WRITE, parseBody, tenantOf } from "./facilities-http";
import {
  assignMaintenanceSchema,
  completeMaintenanceSchema,
  reassignMaintenanceSchema,
  reportMaintenanceSchema,
  setMaintenancePrioritySchema,
} from "./facilities.dto";
import { FAC_MAINTENANCE_SERVICE } from "./facilities.tokens";

/** REST surface for maintenance orders (P2-D20). Gated by facilities:*; tenant-scoped. */
@Controller("facilities/maintenance-orders")
export class MaintenanceOrderController {
  constructor(@Inject(FAC_MAINTENANCE_SERVICE) private readonly service: MaintenanceOrderService) {}

  @RequirePermissions(FACILITIES_WRITE)
  @Post()
  @HttpCode(201)
  async report(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<MaintenanceOrder> {
    const dto = parseBody(reportMaintenanceSchema, body);
    return this.service.report({
      tenantId: tenantOf(principal),
      buildingId: dto.buildingId as Uuid,
      spaceId: (dto.spaceId as Uuid | null | undefined) ?? null,
      systemId: (dto.systemId as Uuid | null | undefined) ?? null,
      code: dto.code,
      summary: dto.summary,
      category: dto.category,
      priority: dto.priority,
      reportedOn: dto.reportedOn,
    });
  }

  @RequirePermissions(FACILITIES_WRITE)
  @Post(":id/assign")
  @HttpCode(200)
  async assign(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<MaintenanceOrder> {
    const dto = parseBody(assignMaintenanceSchema, body);
    return this.service.assign(
      tenantOf(principal),
      id as Uuid,
      dto.assigneeId as Uuid,
      dto.assignedOn,
    );
  }

  @RequirePermissions(FACILITIES_WRITE)
  @Post(":id/reassign")
  @HttpCode(200)
  async reassign(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<MaintenanceOrder> {
    const dto = parseBody(reassignMaintenanceSchema, body);
    return this.service.reassign(tenantOf(principal), id as Uuid, dto.assigneeId as Uuid);
  }

  @RequirePermissions(FACILITIES_WRITE)
  @Post(":id/priority")
  @HttpCode(200)
  async setPriority(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<MaintenanceOrder> {
    const dto = parseBody(setMaintenancePrioritySchema, body);
    return this.service.setPriority(tenantOf(principal), id as Uuid, dto.priority);
  }

  @RequirePermissions(FACILITIES_WRITE)
  @Post(":id/start")
  @HttpCode(200)
  async start(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<MaintenanceOrder> {
    return this.service.start(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FACILITIES_WRITE)
  @Post(":id/complete")
  @HttpCode(200)
  async complete(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<MaintenanceOrder> {
    const dto = parseBody(completeMaintenanceSchema, body);
    return this.service.complete(tenantOf(principal), id as Uuid, dto.completedOn);
  }

  @RequirePermissions(FACILITIES_WRITE)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<MaintenanceOrder> {
    return this.service.cancel(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FACILITIES_READ)
  @Get("open")
  async listOpen(@CurrentPrincipal() principal: Principal): Promise<MaintenanceOrder[]> {
    return this.service.listOpen(tenantOf(principal));
  }

  @RequirePermissions(FACILITIES_READ)
  @Get("by-building/:buildingId")
  async listForBuilding(
    @CurrentPrincipal() principal: Principal,
    @Param("buildingId") buildingId: string,
  ): Promise<MaintenanceOrder[]> {
    return this.service.listForBuilding(tenantOf(principal), buildingId as Uuid);
  }

  @RequirePermissions(FACILITIES_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<MaintenanceOrder[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(FACILITIES_READ)
  @Get("by-assignee/:assigneeId")
  async listForAssignee(
    @CurrentPrincipal() principal: Principal,
    @Param("assigneeId") assigneeId: string,
  ): Promise<MaintenanceOrder[]> {
    return this.service.listForAssignee(tenantOf(principal), assigneeId as Uuid);
  }

  @RequirePermissions(FACILITIES_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<MaintenanceOrder> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
