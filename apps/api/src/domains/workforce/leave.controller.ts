import type { Principal } from "@knowget/auth";
import {
  type LeaveEntitlement,
  type LeaveLedger,
  type LeaveRequest,
  LeaveService,
} from "@knowget/workforce";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  decideLeaveSchema,
  grantEntitlementSchema,
  requestLeaveSchema,
  reviseEntitlementSchema,
} from "./workforce.dto";
import { parseBody, tenantOf, WORKFORCE_READ, WORKFORCE_WRITE } from "./workforce-http";
import { WF_LEAVE_SERVICE } from "./workforce.tokens";

/**
 * REST surface for staff leave (P2-D12) — entitlements, requests and the reconciled ledger. Gated
 * by workforce:*; tenant-scoped.
 */
@Controller("workforce/leave")
export class LeaveController {
  constructor(@Inject(WF_LEAVE_SERVICE) private readonly service: LeaveService) {}

  @RequirePermissions(WORKFORCE_WRITE)
  @Post("entitlements")
  @HttpCode(201)
  async grant(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<LeaveEntitlement> {
    const dto = parseBody(grantEntitlementSchema, body);
    return this.service.grant({
      tenantId: tenantOf(principal),
      employeeId: dto.employeeId as Uuid,
      leaveType: dto.leaveType,
      period: dto.period,
      entitledDays: dto.entitledDays,
    });
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post("entitlements/:id/revise")
  @HttpCode(200)
  async revise(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LeaveEntitlement> {
    const dto = parseBody(reviseEntitlementSchema, body);
    return this.service.reviseEntitlement(tenantOf(principal), id as Uuid, dto.entitledDays);
  }

  @RequirePermissions(WORKFORCE_READ)
  @Get("entitlements/by-employee/:employeeId")
  async listEntitlements(
    @CurrentPrincipal() principal: Principal,
    @Param("employeeId") employeeId: string,
  ): Promise<LeaveEntitlement[]> {
    return this.service.listEntitlements(tenantOf(principal), employeeId as Uuid);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post("requests")
  @HttpCode(201)
  async request(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<LeaveRequest> {
    const dto = parseBody(requestLeaveSchema, body);
    return this.service.request({
      tenantId: tenantOf(principal),
      employeeId: dto.employeeId as Uuid,
      leaveType: dto.leaveType,
      days: dto.days,
      startDate: dto.startDate,
      ...(dto.period !== undefined ? { period: dto.period } : {}),
      ...(dto.endDate !== undefined ? { endDate: dto.endDate } : {}),
      ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
    });
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post("requests/:id/approve")
  @HttpCode(200)
  async approve(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LeaveRequest> {
    const dto = parseBody(decideLeaveSchema, body);
    return this.service.approve(tenantOf(principal), id as Uuid, dto.decidedBy as Uuid | null);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post("requests/:id/reject")
  @HttpCode(200)
  async reject(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LeaveRequest> {
    const dto = parseBody(decideLeaveSchema, body);
    return this.service.reject(tenantOf(principal), id as Uuid, dto.decidedBy as Uuid | null);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post("requests/:id/cancel")
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<LeaveRequest> {
    const dto = parseBody(decideLeaveSchema, body);
    return this.service.cancel(tenantOf(principal), id as Uuid, dto.decidedBy as Uuid | null);
  }

  @RequirePermissions(WORKFORCE_READ)
  @Get("requests/by-employee/:employeeId")
  async listRequests(
    @CurrentPrincipal() principal: Principal,
    @Param("employeeId") employeeId: string,
  ): Promise<LeaveRequest[]> {
    return this.service.listRequests(tenantOf(principal), employeeId as Uuid);
  }

  @RequirePermissions(WORKFORCE_READ)
  @Get("requests/:id")
  async getRequest(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<LeaveRequest> {
    return this.service.getRequest(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WORKFORCE_READ)
  @Get("ledger/:employeeId/:period")
  async computeLedger(
    @CurrentPrincipal() principal: Principal,
    @Param("employeeId") employeeId: string,
    @Param("period") period: string,
  ): Promise<LeaveLedger> {
    return this.service.computeLedger(tenantOf(principal), employeeId as Uuid, period);
  }
}
