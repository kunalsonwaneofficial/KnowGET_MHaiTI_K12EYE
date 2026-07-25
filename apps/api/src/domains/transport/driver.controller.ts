import type { Principal } from "@knowget/auth";
import { type Driver, DriverService } from "@knowget/transport";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { FLEET_READ, FLEET_WRITE, parseBody, tenantOf } from "./transport-http";
import { registerDriverSchema, renewLicenseSchema, setLicenseClassSchema } from "./transport.dto";
import { TR_DRIVER_SERVICE } from "./transport.tokens";

/** REST surface for drivers (P2-D16). Gated by fleet:*; tenant-scoped. */
@Controller("fleet/drivers")
export class DriverController {
  constructor(@Inject(TR_DRIVER_SERVICE) private readonly service: DriverService) {}

  @RequirePermissions(FLEET_WRITE)
  @Post()
  @HttpCode(201)
  async register(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Driver> {
    const dto = parseBody(registerDriverSchema, body);
    return this.service.register({
      tenantId: tenantOf(principal),
      employeeId: dto.employeeId as Uuid,
      licenseNumber: dto.licenseNumber,
      licenseExpiry: dto.licenseExpiry,
      ...(dto.licenseClass !== undefined ? { licenseClass: dto.licenseClass } : {}),
    });
  }

  @RequirePermissions(FLEET_WRITE)
  @Post(":id/renew-license")
  @HttpCode(200)
  async renewLicense(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Driver> {
    const dto = parseBody(renewLicenseSchema, body);
    return this.service.renewLicense(
      tenantOf(principal),
      id as Uuid,
      dto.licenseExpiry,
      dto.licenseNumber,
    );
  }

  @RequirePermissions(FLEET_WRITE)
  @Post(":id/license-class")
  @HttpCode(200)
  async setLicenseClass(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Driver> {
    const dto = parseBody(setLicenseClassSchema, body);
    return this.service.setLicenseClass(tenantOf(principal), id as Uuid, dto.licenseClass);
  }

  @RequirePermissions(FLEET_WRITE)
  @Post(":id/suspend")
  @HttpCode(200)
  async suspend(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Driver> {
    return this.service.suspend(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FLEET_WRITE)
  @Post(":id/reinstate")
  @HttpCode(200)
  async reinstate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Driver> {
    return this.service.reinstate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FLEET_WRITE)
  @Post(":id/deactivate")
  @HttpCode(200)
  async deactivate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Driver> {
    return this.service.deactivate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FLEET_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Driver[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(FLEET_READ)
  @Get("by-license/:licenseNumber")
  async getByLicense(
    @CurrentPrincipal() principal: Principal,
    @Param("licenseNumber") licenseNumber: string,
  ): Promise<Driver> {
    return this.service.getByLicense(tenantOf(principal), licenseNumber);
  }

  @RequirePermissions(FLEET_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Driver[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(FLEET_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Driver> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
