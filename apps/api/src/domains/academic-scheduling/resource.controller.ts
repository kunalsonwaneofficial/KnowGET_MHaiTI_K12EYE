import { type Resource, ResourceService } from "@knowget/academic-scheduling";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { parseBody, SCHEDULING_READ, SCHEDULING_WRITE, tenantOf } from "./academic-scheduling-http";
import {
  createResourceSchema,
  renameSchema,
  setResourceAvailabilitySchema,
  setResourceCapacitySchema,
  setResourceLocationSchema,
} from "./academic-scheduling.dto";
import { SCHED_RESOURCE_SERVICE } from "./academic-scheduling.tokens";

/** REST surface for schedulable resources (P2-D07). Gated by scheduling:*; tenant-scoped. */
@Controller("academic-scheduling/resources")
export class ResourceController {
  constructor(@Inject(SCHED_RESOURCE_SERVICE) private readonly service: ResourceService) {}

  @RequirePermissions(SCHEDULING_WRITE)
  @Post()
  @HttpCode(201)
  async create(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Resource> {
    const dto = parseBody(createResourceSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      code: dto.code,
      name: dto.name,
      kind: dto.kind,
      ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
      ...(dto.location !== undefined ? { location: dto.location } : {}),
      ...(dto.availabilityWindows !== undefined
        ? { availabilityWindows: dto.availabilityWindows }
        : {}),
    });
  }

  @RequirePermissions(SCHEDULING_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Resource[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(SCHEDULING_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Resource[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(SCHEDULING_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Resource> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SCHEDULING_WRITE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Resource> {
    const dto = parseBody(renameSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto.name);
  }

  @RequirePermissions(SCHEDULING_WRITE)
  @Post(":id/capacity")
  @HttpCode(200)
  async setCapacity(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Resource> {
    const dto = parseBody(setResourceCapacitySchema, body);
    return this.service.setCapacity(tenantOf(principal), id as Uuid, dto.capacity);
  }

  @RequirePermissions(SCHEDULING_WRITE)
  @Post(":id/location")
  @HttpCode(200)
  async setLocation(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Resource> {
    const dto = parseBody(setResourceLocationSchema, body);
    return this.service.setLocation(tenantOf(principal), id as Uuid, dto.location);
  }

  @RequirePermissions(SCHEDULING_WRITE)
  @Post(":id/availability")
  @HttpCode(200)
  async setAvailability(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Resource> {
    const dto = parseBody(setResourceAvailabilitySchema, body);
    return this.service.setAvailability(tenantOf(principal), id as Uuid, dto.windows);
  }

  @RequirePermissions(SCHEDULING_WRITE)
  @Post(":id/maintenance")
  @HttpCode(200)
  async markMaintenance(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Resource> {
    return this.service.markMaintenance(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SCHEDULING_WRITE)
  @Post(":id/available")
  @HttpCode(200)
  async markAvailable(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Resource> {
    return this.service.markAvailable(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SCHEDULING_WRITE)
  @Post(":id/retire")
  @HttpCode(200)
  async retire(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Resource> {
    return this.service.retire(tenantOf(principal), id as Uuid);
  }
}
