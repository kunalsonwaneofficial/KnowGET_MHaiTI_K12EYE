import type { Principal } from "@knowget/auth";
import { type Concession, ConcessionService } from "@knowget/financial";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { FINANCE_READ, FINANCE_WRITE, parseBody, tenantOf } from "./financial-http";
import { requestConcessionSchema, reviewConcessionSchema } from "./financial.dto";
import { FIN_CONCESSION_SERVICE } from "./financial.tokens";

/** REST surface for concessions (P2-D14). Gated by finance:*; tenant-scoped. */
@Controller("finance/concessions")
export class ConcessionController {
  constructor(@Inject(FIN_CONCESSION_SERVICE) private readonly service: ConcessionService) {}

  @RequirePermissions(FINANCE_WRITE)
  @Post()
  @HttpCode(201)
  async request(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Concession> {
    const dto = parseBody(requestConcessionSchema, body);
    return this.service.request({
      tenantId: tenantOf(principal),
      studentId: dto.studentId as Uuid,
      type: dto.type,
      reason: dto.reason,
      ...(dto.feeStructureId !== undefined ? { feeStructureId: dto.feeStructureId as Uuid } : {}),
      ...(dto.percentage !== undefined ? { percentage: dto.percentage } : {}),
      ...(dto.amountMinor !== undefined ? { amountMinor: dto.amountMinor } : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
    });
  }

  @RequirePermissions(FINANCE_WRITE)
  @Post(":id/approve")
  @HttpCode(200)
  async approve(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Concession> {
    const dto = parseBody(reviewConcessionSchema, body);
    return this.service.approve(tenantOf(principal), id as Uuid, dto.reviewNote);
  }

  @RequirePermissions(FINANCE_WRITE)
  @Post(":id/reject")
  @HttpCode(200)
  async reject(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Concession> {
    const dto = parseBody(reviewConcessionSchema, body);
    return this.service.reject(tenantOf(principal), id as Uuid, dto.reviewNote);
  }

  @RequirePermissions(FINANCE_WRITE)
  @Post(":id/revoke")
  @HttpCode(200)
  async revoke(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Concession> {
    const dto = parseBody(reviewConcessionSchema, body);
    return this.service.revoke(tenantOf(principal), id as Uuid, dto.reviewNote);
  }

  @RequirePermissions(FINANCE_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Concession[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(FINANCE_READ)
  @Get("by-student/:studentId")
  async listForStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<Concession[]> {
    return this.service.listForStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(FINANCE_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Concession[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(FINANCE_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Concession> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
