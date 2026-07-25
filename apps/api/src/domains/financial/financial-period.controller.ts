import type { Principal } from "@knowget/auth";
import { type FinancialPeriod, FinancialPeriodService } from "@knowget/financial";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { FINANCE_READ, FINANCE_WRITE, parseBody, tenantOf } from "./financial-http";
import { openPeriodSchema, relabelPeriodSchema } from "./financial.dto";
import { FIN_PERIOD_SERVICE } from "./financial.tokens";

/** REST surface for financial periods (P2-D14). Gated by finance:*; tenant-scoped. */
@Controller("finance/periods")
export class FinancialPeriodController {
  constructor(@Inject(FIN_PERIOD_SERVICE) private readonly service: FinancialPeriodService) {}

  @RequirePermissions(FINANCE_WRITE)
  @Post()
  @HttpCode(201)
  async open(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<FinancialPeriod> {
    const dto = parseBody(openPeriodSchema, body);
    return this.service.open({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      code: dto.code,
      label: dto.label,
      startDate: dto.startDate,
      endDate: dto.endDate,
    });
  }

  @RequirePermissions(FINANCE_WRITE)
  @Post(":id/close")
  @HttpCode(200)
  async close(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<FinancialPeriod> {
    return this.service.close(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FINANCE_WRITE)
  @Post(":id/reopen")
  @HttpCode(200)
  async reopen(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<FinancialPeriod> {
    return this.service.reopen(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FINANCE_WRITE)
  @Post(":id/relabel")
  @HttpCode(200)
  async relabel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<FinancialPeriod> {
    const dto = parseBody(relabelPeriodSchema, body);
    return this.service.relabel(tenantOf(principal), id as Uuid, dto.label);
  }

  @RequirePermissions(FINANCE_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<FinancialPeriod[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(FINANCE_READ)
  @Get("by-code/:code")
  async getByCode(
    @CurrentPrincipal() principal: Principal,
    @Param("code") code: string,
  ): Promise<FinancialPeriod> {
    return this.service.getByCode(tenantOf(principal), code);
  }

  @RequirePermissions(FINANCE_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<FinancialPeriod[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(FINANCE_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<FinancialPeriod> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
