import type { Principal } from "@knowget/auth";
import { type RollCall, RollCallService, type RollCallSummary } from "@knowget/residential";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { BOARDING_READ, BOARDING_WRITE, parseBody, tenantOf } from "./residential-http";
import { markRollCallSchema, scheduleRollCallSchema } from "./residential.dto";
import { RS_ROLL_CALL_SERVICE } from "./residential.tokens";

/** REST surface for curfew roll calls (P2-D17). Gated by boarding:*; tenant-scoped. */
@Controller("boarding/roll-calls")
export class RollCallController {
  constructor(@Inject(RS_ROLL_CALL_SERVICE) private readonly service: RollCallService) {}

  @RequirePermissions(BOARDING_WRITE)
  @Post()
  @HttpCode(201)
  async schedule(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<RollCall> {
    const dto = parseBody(scheduleRollCallSchema, body);
    return this.service.schedule({
      tenantId: tenantOf(principal),
      hostelId: dto.hostelId as Uuid,
      scheduledFor: dto.scheduledFor,
    });
  }

  @RequirePermissions(BOARDING_WRITE)
  @Post(":id/start")
  @HttpCode(200)
  async start(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<RollCall> {
    return this.service.start(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(BOARDING_WRITE)
  @Post(":id/mark")
  @HttpCode(200)
  async mark(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<RollCall> {
    const dto = parseBody(markRollCallSchema, body);
    return this.service.mark(tenantOf(principal), id as Uuid, {
      residentId: dto.residentId as Uuid,
      mark: dto.mark,
      notedAt: dto.notedAt,
    });
  }

  @RequirePermissions(BOARDING_WRITE)
  @Post(":id/complete")
  @HttpCode(200)
  async complete(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<RollCall> {
    return this.service.complete(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(BOARDING_WRITE)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<RollCall> {
    return this.service.cancel(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(BOARDING_READ)
  @Get("by-hostel/:hostelId")
  async listForHostel(
    @CurrentPrincipal() principal: Principal,
    @Param("hostelId") hostelId: string,
  ): Promise<RollCall[]> {
    return this.service.listForHostel(tenantOf(principal), hostelId as Uuid);
  }

  @RequirePermissions(BOARDING_READ)
  @Get(":id/summary")
  async summaryFor(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<RollCallSummary> {
    return this.service.summaryFor(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(BOARDING_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<RollCall> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
