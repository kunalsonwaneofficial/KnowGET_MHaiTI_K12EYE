import type { Principal } from "@knowget/auth";
import { type Vehicle, VehicleService } from "@knowget/transport";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { FLEET_READ, FLEET_WRITE, parseBody, tenantOf } from "./transport-http";
import { createVehicleSchema, setCapacitySchema, setMakeModelSchema } from "./transport.dto";
import { TR_VEHICLE_SERVICE } from "./transport.tokens";

/** REST surface for fleet vehicles (P2-D16). Gated by fleet:*; tenant-scoped. */
@Controller("fleet/vehicles")
export class VehicleController {
  constructor(@Inject(TR_VEHICLE_SERVICE) private readonly service: VehicleService) {}

  @RequirePermissions(FLEET_WRITE)
  @Post()
  @HttpCode(201)
  async create(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Vehicle> {
    const dto = parseBody(createVehicleSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      registrationNumber: dto.registrationNumber,
      type: dto.type,
      seatingCapacity: dto.seatingCapacity,
      ownership: dto.ownership,
      ...(dto.make !== undefined ? { make: dto.make } : {}),
      ...(dto.model !== undefined ? { model: dto.model } : {}),
    });
  }

  @RequirePermissions(FLEET_WRITE)
  @Post(":id/capacity")
  @HttpCode(200)
  async setCapacity(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Vehicle> {
    const dto = parseBody(setCapacitySchema, body);
    return this.service.setCapacity(tenantOf(principal), id as Uuid, dto.seatingCapacity);
  }

  @RequirePermissions(FLEET_WRITE)
  @Post(":id/make-model")
  @HttpCode(200)
  async setMakeModel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Vehicle> {
    const dto = parseBody(setMakeModelSchema, body);
    return this.service.setMakeModel(tenantOf(principal), id as Uuid, dto.make, dto.model);
  }

  @RequirePermissions(FLEET_WRITE)
  @Post(":id/send-to-maintenance")
  @HttpCode(200)
  async sendToMaintenance(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Vehicle> {
    return this.service.sendToMaintenance(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FLEET_WRITE)
  @Post(":id/return-from-maintenance")
  @HttpCode(200)
  async returnFromMaintenance(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Vehicle> {
    return this.service.returnFromMaintenance(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FLEET_WRITE)
  @Post(":id/retire")
  @HttpCode(200)
  async retire(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Vehicle> {
    return this.service.retire(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FLEET_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Vehicle[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(FLEET_READ)
  @Get("by-registration/:registrationNumber")
  async getByRegistration(
    @CurrentPrincipal() principal: Principal,
    @Param("registrationNumber") registrationNumber: string,
  ): Promise<Vehicle> {
    return this.service.getByRegistration(tenantOf(principal), registrationNumber);
  }

  @RequirePermissions(FLEET_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Vehicle[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(FLEET_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Vehicle> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
