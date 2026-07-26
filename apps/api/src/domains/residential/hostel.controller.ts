import type { Principal } from "@knowget/auth";
import { type Hostel, HostelService } from "@knowget/residential";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { HOSTEL_READ, HOSTEL_WRITE, parseBody, tenantOf } from "./residential-http";
import { assignWardenSchema, createHostelSchema, renameHostelSchema } from "./residential.dto";
import { RS_HOSTEL_SERVICE } from "./residential.tokens";

/** REST surface for hostels (P2-D17). Gated by hostel:*; tenant-scoped. */
@Controller("hostel/hostels")
export class HostelController {
  constructor(@Inject(RS_HOSTEL_SERVICE) private readonly service: HostelService) {}

  @RequirePermissions(HOSTEL_WRITE)
  @Post()
  @HttpCode(201)
  async create(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Hostel> {
    const dto = parseBody(createHostelSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      code: dto.code,
      name: dto.name,
      type: dto.type,
    });
  }

  @RequirePermissions(HOSTEL_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Hostel> {
    const dto = parseBody(renameHostelSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(HOSTEL_WRITE)
  @Post(":id/assign-warden")
  @HttpCode(200)
  async assignWarden(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Hostel> {
    const dto = parseBody(assignWardenSchema, body);
    return this.service.assignWarden(tenantOf(principal), id as Uuid, dto.wardenId as Uuid);
  }

  @RequirePermissions(HOSTEL_WRITE)
  @Post(":id/unassign-warden")
  @HttpCode(200)
  async unassignWarden(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Hostel> {
    return this.service.unassignWarden(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(HOSTEL_WRITE)
  @Post(":id/send-to-maintenance")
  @HttpCode(200)
  async sendToMaintenance(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Hostel> {
    return this.service.sendToMaintenance(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(HOSTEL_WRITE)
  @Post(":id/return-from-maintenance")
  @HttpCode(200)
  async returnFromMaintenance(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Hostel> {
    return this.service.returnFromMaintenance(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(HOSTEL_WRITE)
  @Post(":id/decommission")
  @HttpCode(200)
  async decommission(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Hostel> {
    return this.service.decommission(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(HOSTEL_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Hostel[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(HOSTEL_READ)
  @Get("by-code/:code")
  async getByCode(
    @CurrentPrincipal() principal: Principal,
    @Param("code") code: string,
  ): Promise<Hostel> {
    return this.service.getByCode(tenantOf(principal), code);
  }

  @RequirePermissions(HOSTEL_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Hostel[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(HOSTEL_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Hostel> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
