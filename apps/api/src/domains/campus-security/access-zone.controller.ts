import type { Principal } from "@knowget/auth";
import { type AccessZone, AccessZoneService } from "@knowget/campus-security";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { parseBody, SECURITY_READ, SECURITY_WRITE, tenantOf } from "./campus-security-http";
import {
  createZoneSchema,
  renameZoneSchema,
  setSecurityLevelSchema,
  setZoneCapacitySchema,
} from "./campus-security.dto";
import { CS_ZONE_SERVICE } from "./campus-security.tokens";

/** REST surface for access zones (P2-D21). Gated by security:*; tenant-scoped. */
@Controller("security/zones")
export class AccessZoneController {
  constructor(@Inject(CS_ZONE_SERVICE) private readonly service: AccessZoneService) {}

  @RequirePermissions(SECURITY_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<AccessZone> {
    const dto = parseBody(createZoneSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      code: dto.code,
      name: dto.name,
      securityLevel: dto.securityLevel,
      capacity: dto.capacity,
    });
  }

  @RequirePermissions(SECURITY_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AccessZone> {
    const dto = parseBody(renameZoneSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(SECURITY_WRITE)
  @Post(":id/security-level")
  @HttpCode(200)
  async setSecurityLevel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AccessZone> {
    const dto = parseBody(setSecurityLevelSchema, body);
    return this.service.setSecurityLevel(tenantOf(principal), id as Uuid, dto.securityLevel);
  }

  @RequirePermissions(SECURITY_WRITE)
  @Post(":id/capacity")
  @HttpCode(200)
  async setCapacity(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<AccessZone> {
    const dto = parseBody(setZoneCapacitySchema, body);
    return this.service.setCapacity(tenantOf(principal), id as Uuid, dto.capacity);
  }

  @RequirePermissions(SECURITY_WRITE)
  @Post(":id/lock-down")
  @HttpCode(200)
  async lockDown(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AccessZone> {
    return this.service.lockDown(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SECURITY_WRITE)
  @Post(":id/lift-lockdown")
  @HttpCode(200)
  async liftLockdown(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AccessZone> {
    return this.service.liftLockdown(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SECURITY_WRITE)
  @Post(":id/decommission")
  @HttpCode(200)
  async decommission(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AccessZone> {
    return this.service.decommission(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SECURITY_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<AccessZone[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(SECURITY_READ)
  @Get("by-code/:code")
  async getByCode(
    @CurrentPrincipal() principal: Principal,
    @Param("code") code: string,
  ): Promise<AccessZone> {
    return this.service.getByCode(tenantOf(principal), code);
  }

  @RequirePermissions(SECURITY_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<AccessZone[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(SECURITY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<AccessZone> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
