import type { Principal } from "@knowget/auth";
import { type PayrollRun, PayrollRunService } from "@knowget/financial";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { PAYROLL_READ, PAYROLL_WRITE, parseBody, tenantOf } from "./financial-http";
import { createPayrollRunSchema } from "./financial.dto";
import { FIN_PAYROLL_RUN_SERVICE } from "./financial.tokens";

/** REST surface for payroll runs (P2-D14). Gated by payroll:*; tenant-scoped. */
@Controller("payroll/runs")
export class PayrollRunController {
  constructor(@Inject(FIN_PAYROLL_RUN_SERVICE) private readonly service: PayrollRunService) {}

  @RequirePermissions(PAYROLL_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<PayrollRun> {
    const dto = parseBody(createPayrollRunSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      label: dto.label,
      currency: dto.currency,
      ...(dto.periodId !== undefined ? { periodId: dto.periodId as Uuid } : {}),
    });
  }

  @RequirePermissions(PAYROLL_WRITE)
  @Post(":id/process")
  @HttpCode(200)
  async process(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<PayrollRun> {
    return this.service.process(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(PAYROLL_WRITE)
  @Post(":id/pay")
  @HttpCode(200)
  async markPaid(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<PayrollRun> {
    return this.service.markPaid(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(PAYROLL_WRITE)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<PayrollRun> {
    return this.service.cancel(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(PAYROLL_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<PayrollRun[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(PAYROLL_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<PayrollRun[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(PAYROLL_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<PayrollRun> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
