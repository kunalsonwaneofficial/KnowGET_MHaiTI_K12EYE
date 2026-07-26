import type { Principal } from "@knowget/auth";
import { type Space, SpaceService } from "@knowget/facilities";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { FACILITIES_READ, FACILITIES_WRITE, parseBody, tenantOf } from "./facilities-http";
import {
  createSpaceSchema,
  setSpaceCapacitySchema,
  setSpaceFloorSchema,
  setSpaceTypeSchema,
} from "./facilities.dto";
import { FAC_SPACE_SERVICE } from "./facilities.tokens";

/** REST surface for spaces (P2-D20). Gated by facilities:*; tenant-scoped. */
@Controller("facilities/spaces")
export class SpaceController {
  constructor(@Inject(FAC_SPACE_SERVICE) private readonly service: SpaceService) {}

  @RequirePermissions(FACILITIES_WRITE)
  @Post()
  @HttpCode(201)
  async create(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Space> {
    const dto = parseBody(createSpaceSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      buildingId: dto.buildingId as Uuid,
      code: dto.code,
      type: dto.type,
      floor: dto.floor,
      capacity: dto.capacity,
    });
  }

  @RequirePermissions(FACILITIES_WRITE)
  @Post(":id/type")
  @HttpCode(200)
  async setType(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Space> {
    const dto = parseBody(setSpaceTypeSchema, body);
    return this.service.setType(tenantOf(principal), id as Uuid, dto.type);
  }

  @RequirePermissions(FACILITIES_WRITE)
  @Post(":id/capacity")
  @HttpCode(200)
  async setCapacity(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Space> {
    const dto = parseBody(setSpaceCapacitySchema, body);
    return this.service.setCapacity(tenantOf(principal), id as Uuid, dto.capacity);
  }

  @RequirePermissions(FACILITIES_WRITE)
  @Post(":id/floor")
  @HttpCode(200)
  async setFloor(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Space> {
    const dto = parseBody(setSpaceFloorSchema, body);
    return this.service.setFloor(tenantOf(principal), id as Uuid, dto.floor);
  }

  @RequirePermissions(FACILITIES_WRITE)
  @Post(":id/make-available")
  @HttpCode(200)
  async makeAvailable(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Space> {
    return this.service.makeAvailable(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FACILITIES_WRITE)
  @Post(":id/take-out-of-service")
  @HttpCode(200)
  async takeOutOfService(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Space> {
    return this.service.takeOutOfService(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FACILITIES_WRITE)
  @Post(":id/return-to-service")
  @HttpCode(200)
  async returnToService(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Space> {
    return this.service.returnToService(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FACILITIES_WRITE)
  @Post(":id/decommission")
  @HttpCode(200)
  async decommission(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Space> {
    return this.service.decommission(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FACILITIES_READ)
  @Get("by-building/:buildingId")
  async listForBuilding(
    @CurrentPrincipal() principal: Principal,
    @Param("buildingId") buildingId: string,
  ): Promise<Space[]> {
    return this.service.listForBuilding(tenantOf(principal), buildingId as Uuid);
  }

  @RequirePermissions(FACILITIES_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Space[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(FACILITIES_READ)
  @Get(":id")
  async getById(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Space> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
