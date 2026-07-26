import type { Principal } from "@knowget/auth";
import { type Building, BuildingService } from "@knowget/facilities";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { FACILITIES_READ, FACILITIES_WRITE, parseBody, tenantOf } from "./facilities-http";
import { registerBuildingSchema, renameBuildingSchema, setFloorsSchema } from "./facilities.dto";
import { FAC_BUILDING_SERVICE } from "./facilities.tokens";

/** REST surface for buildings (P2-D20). Gated by facilities:*; tenant-scoped. */
@Controller("facilities/buildings")
export class BuildingController {
  constructor(@Inject(FAC_BUILDING_SERVICE) private readonly service: BuildingService) {}

  @RequirePermissions(FACILITIES_WRITE)
  @Post()
  @HttpCode(201)
  async register(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Building> {
    const dto = parseBody(registerBuildingSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      code: dto.code,
      name: dto.name,
      type: dto.type,
      floors: dto.floors,
    });
  }

  @RequirePermissions(FACILITIES_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Building> {
    const dto = parseBody(renameBuildingSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(FACILITIES_WRITE)
  @Post(":id/floors")
  @HttpCode(200)
  async setFloors(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Building> {
    const dto = parseBody(setFloorsSchema, body);
    return this.service.setFloors(tenantOf(principal), id as Uuid, dto.floors);
  }

  @RequirePermissions(FACILITIES_WRITE)
  @Post(":id/start-renovation")
  @HttpCode(200)
  async startRenovation(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Building> {
    return this.service.startRenovation(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FACILITIES_WRITE)
  @Post(":id/complete-renovation")
  @HttpCode(200)
  async completeRenovation(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Building> {
    return this.service.completeRenovation(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FACILITIES_WRITE)
  @Post(":id/decommission")
  @HttpCode(200)
  async decommission(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Building> {
    return this.service.decommission(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FACILITIES_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Building[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(FACILITIES_READ)
  @Get("by-code/:code")
  async getByCode(
    @CurrentPrincipal() principal: Principal,
    @Param("code") code: string,
  ): Promise<Building> {
    return this.service.getByCode(tenantOf(principal), code);
  }

  @RequirePermissions(FACILITIES_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Building[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(FACILITIES_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Building> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
