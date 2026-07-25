import type { Principal } from "@knowget/auth";
import { type Payslip, PayslipService } from "@knowget/financial";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { PAYROLL_READ, PAYROLL_WRITE, parseBody, tenantOf } from "./financial-http";
import { addPayComponentSchema, draftPayslipSchema } from "./financial.dto";
import { FIN_PAYSLIP_SERVICE } from "./financial.tokens";

/** REST surface for payslips (P2-D14) — the workforce grade/band becomes concrete pay. payroll:*. */
@Controller("payroll/payslips")
export class PayslipController {
  constructor(@Inject(FIN_PAYSLIP_SERVICE) private readonly service: PayslipService) {}

  @RequirePermissions(PAYROLL_WRITE)
  @Post()
  @HttpCode(201)
  async draft(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Payslip> {
    const dto = parseBody(draftPayslipSchema, body);
    return this.service.draftForEmployee({
      tenantId: tenantOf(principal),
      payrollRunId: dto.payrollRunId as Uuid,
      employeeId: dto.employeeId as Uuid,
      ...(dto.extraEarnings !== undefined ? { extraEarnings: dto.extraEarnings } : {}),
      ...(dto.deductions !== undefined ? { deductions: dto.deductions } : {}),
    });
  }

  @RequirePermissions(PAYROLL_WRITE)
  @Post(":id/earnings")
  @HttpCode(200)
  async addEarning(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Payslip> {
    const dto = parseBody(addPayComponentSchema, body);
    return this.service.addEarning(tenantOf(principal), id as Uuid, dto);
  }

  @RequirePermissions(PAYROLL_WRITE)
  @Post(":id/earnings/:key/remove")
  @HttpCode(200)
  async removeEarning(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("key") key: string,
  ): Promise<Payslip> {
    return this.service.removeEarning(tenantOf(principal), id as Uuid, key);
  }

  @RequirePermissions(PAYROLL_WRITE)
  @Post(":id/deductions")
  @HttpCode(200)
  async addDeduction(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Payslip> {
    const dto = parseBody(addPayComponentSchema, body);
    return this.service.addDeduction(tenantOf(principal), id as Uuid, dto);
  }

  @RequirePermissions(PAYROLL_WRITE)
  @Post(":id/deductions/:key/remove")
  @HttpCode(200)
  async removeDeduction(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("key") key: string,
  ): Promise<Payslip> {
    return this.service.removeDeduction(tenantOf(principal), id as Uuid, key);
  }

  @RequirePermissions(PAYROLL_WRITE)
  @Post(":id/approve")
  @HttpCode(200)
  async approve(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Payslip> {
    return this.service.approve(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(PAYROLL_WRITE)
  @Post(":id/pay")
  @HttpCode(200)
  async markPaid(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Payslip> {
    return this.service.markPaid(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(PAYROLL_READ)
  @Get("by-run/:payrollRunId")
  async listForRun(
    @CurrentPrincipal() principal: Principal,
    @Param("payrollRunId") payrollRunId: string,
  ): Promise<Payslip[]> {
    return this.service.listForRun(tenantOf(principal), payrollRunId as Uuid);
  }

  @RequirePermissions(PAYROLL_READ)
  @Get("by-employee/:employeeId")
  async listForEmployee(
    @CurrentPrincipal() principal: Principal,
    @Param("employeeId") employeeId: string,
  ): Promise<Payslip[]> {
    return this.service.listForEmployee(tenantOf(principal), employeeId as Uuid);
  }

  @RequirePermissions(PAYROLL_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Payslip> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
