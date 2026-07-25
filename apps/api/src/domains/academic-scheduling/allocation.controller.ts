import { type Allocation, AllocationService } from "@knowget/academic-scheduling";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { parseBody, SCHEDULING_READ, SCHEDULING_WRITE, tenantOf } from "./academic-scheduling-http";
import { allocateSchema } from "./academic-scheduling.dto";
import { SCHED_ALLOCATION_SERVICE } from "./academic-scheduling.tokens";

/** REST surface for resource allocations (P2-D07). Gated by scheduling:*; tenant-scoped. */
@Controller("academic-scheduling/allocations")
export class AllocationController {
  constructor(@Inject(SCHED_ALLOCATION_SERVICE) private readonly service: AllocationService) {}

  @RequirePermissions(SCHEDULING_WRITE)
  @Post()
  @HttpCode(201)
  async allocate(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Allocation> {
    const dto = parseBody(allocateSchema, body);
    return this.service.allocate({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      resourceKind: dto.resourceKind,
      resourceId: dto.resourceId as Uuid,
      dayOfWeek: dto.dayOfWeek,
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
      ...(dto.scheduleSlotId !== undefined ? { scheduleSlotId: dto.scheduleSlotId as Uuid } : {}),
      ...(dto.sectionId !== undefined ? { sectionId: dto.sectionId as Uuid } : {}),
      ...(dto.occupancy !== undefined ? { occupancy: dto.occupancy } : {}),
    });
  }

  @RequirePermissions(SCHEDULING_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Allocation[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(SCHEDULING_READ)
  @Get("by-resource/:resourceId")
  async listForResource(
    @CurrentPrincipal() principal: Principal,
    @Param("resourceId") resourceId: string,
  ): Promise<Allocation[]> {
    return this.service.listForResource(tenantOf(principal), resourceId as Uuid);
  }

  @RequirePermissions(SCHEDULING_READ)
  @Get("by-slot/:scheduleSlotId")
  async listForSlot(
    @CurrentPrincipal() principal: Principal,
    @Param("scheduleSlotId") scheduleSlotId: string,
  ): Promise<Allocation[]> {
    return this.service.listForSlot(tenantOf(principal), scheduleSlotId as Uuid);
  }

  @RequirePermissions(SCHEDULING_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Allocation> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(SCHEDULING_WRITE)
  @Post(":id/release")
  @HttpCode(200)
  async release(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Allocation> {
    return this.service.release(tenantOf(principal), id as Uuid);
  }
}
