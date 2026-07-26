import type { Principal } from "@knowget/auth";
import { type BedAllocation, BedAllocationService } from "@knowget/residential";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { BOARDING_READ, BOARDING_WRITE, parseBody, tenantOf } from "./residential-http";
import { createAllocationSchema, endAllocationSchema } from "./residential.dto";
import { RS_ALLOCATION_SERVICE } from "./residential.tokens";

/** REST surface for bed allocations (P2-D17). Gated by boarding:*; tenant-scoped. */
@Controller("boarding/allocations")
export class BedAllocationController {
  constructor(@Inject(RS_ALLOCATION_SERVICE) private readonly service: BedAllocationService) {}

  @RequirePermissions(BOARDING_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<BedAllocation> {
    const dto = parseBody(createAllocationSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      roomId: dto.roomId as Uuid,
      bedKey: dto.bedKey,
      studentId: dto.studentId as Uuid,
      effectiveFrom: dto.effectiveFrom,
    });
  }

  @RequirePermissions(BOARDING_WRITE)
  @Post(":id/end")
  @HttpCode(200)
  async end(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<BedAllocation> {
    const dto = parseBody(endAllocationSchema, body);
    return this.service.end(tenantOf(principal), id as Uuid, dto.effectiveTo);
  }

  @RequirePermissions(BOARDING_READ)
  @Get("by-room/:roomId/active")
  async listActiveForRoom(
    @CurrentPrincipal() principal: Principal,
    @Param("roomId") roomId: string,
  ): Promise<BedAllocation[]> {
    return this.service.listActiveForRoom(tenantOf(principal), roomId as Uuid);
  }

  @RequirePermissions(BOARDING_READ)
  @Get("by-hostel/:hostelId/active")
  async listActiveForHostel(
    @CurrentPrincipal() principal: Principal,
    @Param("hostelId") hostelId: string,
  ): Promise<BedAllocation[]> {
    return this.service.listActiveForHostel(tenantOf(principal), hostelId as Uuid);
  }

  @RequirePermissions(BOARDING_READ)
  @Get("by-student/:studentId")
  async listForStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<BedAllocation[]> {
    return this.service.listForStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(BOARDING_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<BedAllocation> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
