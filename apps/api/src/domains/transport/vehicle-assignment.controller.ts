import type { Principal } from "@knowget/auth";
import { type VehicleAssignment, VehicleAssignmentService } from "@knowget/transport";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { TRANSPORT_READ, TRANSPORT_WRITE, parseBody, tenantOf } from "./transport-http";
import { createAssignmentSchema, endAssignmentSchema } from "./transport.dto";
import { TR_ASSIGNMENT_SERVICE } from "./transport.tokens";

/** REST surface for vehicle assignments (P2-D16). Gated by transport:*; tenant-scoped. */
@Controller("transport/assignments")
export class VehicleAssignmentController {
  constructor(@Inject(TR_ASSIGNMENT_SERVICE) private readonly service: VehicleAssignmentService) {}

  @RequirePermissions(TRANSPORT_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<VehicleAssignment> {
    const dto = parseBody(createAssignmentSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      routeId: dto.routeId as Uuid,
      vehicleId: dto.vehicleId as Uuid,
      driverId: dto.driverId as Uuid,
      effectiveFrom: dto.effectiveFrom,
    });
  }

  @RequirePermissions(TRANSPORT_WRITE)
  @Post(":id/end")
  @HttpCode(200)
  async end(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<VehicleAssignment> {
    const dto = parseBody(endAssignmentSchema, body);
    return this.service.end(tenantOf(principal), id as Uuid, dto.effectiveTo);
  }

  @RequirePermissions(TRANSPORT_READ)
  @Get("by-route/:routeId/active")
  async getActiveForRoute(
    @CurrentPrincipal() principal: Principal,
    @Param("routeId") routeId: string,
  ): Promise<VehicleAssignment | null> {
    return this.service.getActiveForRoute(tenantOf(principal), routeId as Uuid);
  }

  @RequirePermissions(TRANSPORT_READ)
  @Get("by-route/:routeId")
  async listForRoute(
    @CurrentPrincipal() principal: Principal,
    @Param("routeId") routeId: string,
  ): Promise<VehicleAssignment[]> {
    return this.service.listForRoute(tenantOf(principal), routeId as Uuid);
  }

  @RequirePermissions(TRANSPORT_READ)
  @Get("by-vehicle/:vehicleId")
  async listForVehicle(
    @CurrentPrincipal() principal: Principal,
    @Param("vehicleId") vehicleId: string,
  ): Promise<VehicleAssignment[]> {
    return this.service.listForVehicle(tenantOf(principal), vehicleId as Uuid);
  }

  @RequirePermissions(TRANSPORT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<VehicleAssignment[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(TRANSPORT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<VehicleAssignment> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
