import type { Principal } from "@knowget/auth";
import { type Warden, WardenService } from "@knowget/residential";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { HOSTEL_READ, HOSTEL_WRITE, parseBody, tenantOf } from "./residential-http";
import { registerWardenSchema, setWardenRoleSchema } from "./residential.dto";
import { RS_WARDEN_SERVICE } from "./residential.tokens";

/** REST surface for wardens (P2-D17). Gated by hostel:*; tenant-scoped. */
@Controller("hostel/wardens")
export class WardenController {
  constructor(@Inject(RS_WARDEN_SERVICE) private readonly service: WardenService) {}

  @RequirePermissions(HOSTEL_WRITE)
  @Post()
  @HttpCode(201)
  async register(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Warden> {
    const dto = parseBody(registerWardenSchema, body);
    return this.service.register({
      tenantId: tenantOf(principal),
      employeeId: dto.employeeId as Uuid,
      role: dto.role,
    });
  }

  @RequirePermissions(HOSTEL_WRITE)
  @Post(":id/role")
  @HttpCode(200)
  async setRole(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Warden> {
    const dto = parseBody(setWardenRoleSchema, body);
    return this.service.setRole(tenantOf(principal), id as Uuid, dto.role);
  }

  @RequirePermissions(HOSTEL_WRITE)
  @Post(":id/suspend")
  @HttpCode(200)
  async suspend(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Warden> {
    return this.service.suspend(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(HOSTEL_WRITE)
  @Post(":id/reinstate")
  @HttpCode(200)
  async reinstate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Warden> {
    return this.service.reinstate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(HOSTEL_WRITE)
  @Post(":id/relieve")
  @HttpCode(200)
  async relieve(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Warden> {
    return this.service.relieve(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(HOSTEL_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Warden[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(HOSTEL_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Warden[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(HOSTEL_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Warden> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
