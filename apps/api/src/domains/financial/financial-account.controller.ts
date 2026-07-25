import type { Principal } from "@knowget/auth";
import {
  FinancialAccountService,
  type ReceivablesSummary,
  type StudentFinancialAccount,
} from "@knowget/financial";
import type { Uuid } from "@knowget/types";
import { Controller, Get, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { FINANCE_READ, FINANCE_WRITE, parseBody, tenantOf } from "./financial-http";
import { receivablesQuerySchema } from "./financial.dto";
import { FIN_ACCOUNT_SERVICE } from "./financial.tokens";

/** REST surface for student financial accounts and the receivables rollup (P2-D14). finance:*. */
@Controller("finance/accounts")
export class FinancialAccountController {
  constructor(@Inject(FIN_ACCOUNT_SERVICE) private readonly service: FinancialAccountService) {}

  @RequirePermissions(FINANCE_WRITE)
  @Post("by-student/:studentId/refresh")
  @HttpCode(200)
  async refresh(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<StudentFinancialAccount> {
    return this.service.refresh(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(FINANCE_READ)
  @Get("by-student/:studentId")
  async getForStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<StudentFinancialAccount> {
    return this.service.getForStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(FINANCE_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<StudentFinancialAccount[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(FINANCE_READ)
  @Get("receivables/:organizationId")
  async receivables(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
    @Query() query: unknown,
  ): Promise<ReceivablesSummary> {
    const { currency } = parseBody(receivablesQuerySchema, query);
    return this.service.receivablesFor(tenantOf(principal), organizationId as Uuid, currency);
  }

  @RequirePermissions(FINANCE_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<StudentFinancialAccount> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
