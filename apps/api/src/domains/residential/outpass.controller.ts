import type { Principal } from "@knowget/auth";
import { type Outpass, OutpassService } from "@knowget/residential";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { BOARDING_READ, BOARDING_WRITE, parseBody, tenantOf } from "./residential-http";
import {
  approveOutpassSchema,
  checkOutOutpassSchema,
  requestOutpassSchema,
  returnOutpassSchema,
} from "./residential.dto";
import { RS_OUTPASS_SERVICE } from "./residential.tokens";

/** REST surface for outpasses (P2-D17). Gated by boarding:*; tenant-scoped. */
@Controller("boarding/outpasses")
export class OutpassController {
  constructor(@Inject(RS_OUTPASS_SERVICE) private readonly service: OutpassService) {}

  @RequirePermissions(BOARDING_WRITE)
  @Post()
  @HttpCode(201)
  async request(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Outpass> {
    const dto = parseBody(requestOutpassSchema, body);
    return this.service.request({
      tenantId: tenantOf(principal),
      studentId: dto.studentId as Uuid,
      type: dto.type,
      expectedOutAt: dto.expectedOutAt,
      expectedInAt: dto.expectedInAt,
      ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
    });
  }

  @RequirePermissions(BOARDING_WRITE)
  @Post(":id/approve")
  @HttpCode(200)
  async approve(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Outpass> {
    const dto = parseBody(approveOutpassSchema, body);
    return this.service.approve(tenantOf(principal), id as Uuid, dto.approvedBy as Uuid);
  }

  @RequirePermissions(BOARDING_WRITE)
  @Post(":id/reject")
  @HttpCode(200)
  async reject(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Outpass> {
    return this.service.reject(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(BOARDING_WRITE)
  @Post(":id/check-out")
  @HttpCode(200)
  async checkOut(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Outpass> {
    const dto = parseBody(checkOutOutpassSchema, body);
    return this.service.checkOut(tenantOf(principal), id as Uuid, dto.actualOutAt);
  }

  @RequirePermissions(BOARDING_WRITE)
  @Post(":id/return")
  @HttpCode(200)
  async return(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Outpass> {
    const dto = parseBody(returnOutpassSchema, body);
    return this.service.return(tenantOf(principal), id as Uuid, dto.actualInAt);
  }

  @RequirePermissions(BOARDING_WRITE)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Outpass> {
    return this.service.cancel(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(BOARDING_READ)
  @Get("by-student/:studentId")
  async listForStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<Outpass[]> {
    return this.service.listForStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(BOARDING_READ)
  @Get("by-hostel/:hostelId/open")
  async listOpenForHostel(
    @CurrentPrincipal() principal: Principal,
    @Param("hostelId") hostelId: string,
  ): Promise<Outpass[]> {
    return this.service.listOpenForHostel(tenantOf(principal), hostelId as Uuid);
  }

  @RequirePermissions(BOARDING_READ)
  @Get("by-hostel/:hostelId")
  async listForHostel(
    @CurrentPrincipal() principal: Principal,
    @Param("hostelId") hostelId: string,
  ): Promise<Outpass[]> {
    return this.service.listForHostel(tenantOf(principal), hostelId as Uuid);
  }

  @RequirePermissions(BOARDING_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Outpass> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
