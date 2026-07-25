import { type Leave, LeaveService } from "@knowget/attendance-presence";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ATTENDANCE_READ, ATTENDANCE_WRITE, parseBody, tenantOf } from "./attendance-presence-http";
import {
  addDocumentSchema,
  leaveDecisionSchema,
  requestLeaveSchema,
} from "./attendance-presence.dto";
import { AP_LEAVE_SERVICE } from "./attendance-presence.tokens";

/** REST surface for leave requests (P2-D08). Gated by attendance:*; tenant-scoped. */
@Controller("attendance-presence/leave")
export class LeaveController {
  constructor(@Inject(AP_LEAVE_SERVICE) private readonly service: LeaveService) {}

  @RequirePermissions(ATTENDANCE_WRITE)
  @Post()
  @HttpCode(201)
  async request(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Leave> {
    const dto = parseBody(requestLeaveSchema, body);
    return this.service.request({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      personId: dto.personId as Uuid,
      holderType: dto.holderType,
      leaveType: dto.leaveType,
      fromDate: dto.fromDate,
      toDate: dto.toDate,
      reason: dto.reason,
      ...(dto.supportingDocuments !== undefined
        ? { supportingDocuments: dto.supportingDocuments }
        : {}),
    });
  }

  @RequirePermissions(ATTENDANCE_READ)
  @Get("by-person/:personId")
  async listForPerson(
    @CurrentPrincipal() principal: Principal,
    @Param("personId") personId: string,
  ): Promise<Leave[]> {
    return this.service.listForPerson(tenantOf(principal), personId as Uuid);
  }

  @RequirePermissions(ATTENDANCE_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Leave[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(ATTENDANCE_READ)
  @Get(":id")
  async getById(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Leave> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ATTENDANCE_WRITE)
  @Post(":id/approve")
  @HttpCode(200)
  async approve(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Leave> {
    const dto = parseBody(leaveDecisionSchema, body);
    return this.service.approve(
      tenantOf(principal),
      id as Uuid,
      dto.reviewedBy as Uuid,
      dto.note ?? null,
    );
  }

  @RequirePermissions(ATTENDANCE_WRITE)
  @Post(":id/reject")
  @HttpCode(200)
  async reject(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Leave> {
    const dto = parseBody(leaveDecisionSchema, body);
    return this.service.reject(
      tenantOf(principal),
      id as Uuid,
      dto.reviewedBy as Uuid,
      dto.note ?? null,
    );
  }

  @RequirePermissions(ATTENDANCE_WRITE)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Leave> {
    return this.service.cancel(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ATTENDANCE_WRITE)
  @Post(":id/documents")
  @HttpCode(200)
  async addDocument(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Leave> {
    const dto = parseBody(addDocumentSchema, body);
    return this.service.addDocument(tenantOf(principal), id as Uuid, {
      name: dto.name,
      url: dto.url,
    });
  }
}
