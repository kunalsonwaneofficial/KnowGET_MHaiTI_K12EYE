import type { Principal } from "@knowget/auth";
import {
  CirculationPolicyService,
  type Loan,
  type LoanDueStatus,
  LibraryMemberService,
  LoanService,
} from "@knowget/library";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { CIRCULATION_READ, CIRCULATION_WRITE, parseBody, tenantOf } from "./library-http";
import { issueLoanSchema, returnLoanSchema } from "./library.dto";
import { LB_LOAN_SERVICE, LB_MEMBER_SERVICE, LB_POLICY_SERVICE } from "./library.tokens";

/**
 * REST surface for loans (P2-D18). Gated by circulation:*; tenant-scoped. Issue is the composition point
 * where lending terms are resolved: the client names only the copy, the member and the issue date, and the
 * controller reads the member's category and organization, resolves the terms (loan period, renewal +
 * borrowing limits) from that organization's active circulation policy, and issues the loan with them
 * captured. No money — overdue/lost fines are Finance's (P2-D14).
 */
@Controller("circulation/loans")
export class LoanController {
  constructor(
    @Inject(LB_LOAN_SERVICE) private readonly service: LoanService,
    @Inject(LB_MEMBER_SERVICE) private readonly members: LibraryMemberService,
    @Inject(LB_POLICY_SERVICE) private readonly policies: CirculationPolicyService,
  ) {}

  @RequirePermissions(CIRCULATION_WRITE)
  @Post()
  @HttpCode(201)
  async issue(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Loan> {
    const tenantId = tenantOf(principal);
    const dto = parseBody(issueLoanSchema, body);
    const member = await this.members.getById(tenantId, dto.memberId as Uuid);
    const terms = await this.policies.resolveTermsForMember(
      tenantId,
      member.organizationId,
      member.category,
    );
    return this.service.issue({
      tenantId,
      copyId: dto.copyId as Uuid,
      memberId: dto.memberId as Uuid,
      issueDate: dto.issueDate,
      loanPeriodDays: terms.loanPeriodDays,
      renewalLimit: terms.renewalLimit,
      borrowingLimit: terms.borrowingLimit,
    });
  }

  @RequirePermissions(CIRCULATION_WRITE)
  @Post(":id/renew")
  @HttpCode(200)
  async renew(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Loan> {
    return this.service.renew(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(CIRCULATION_WRITE)
  @Post(":id/return")
  @HttpCode(200)
  async returnItem(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Loan> {
    const dto = parseBody(returnLoanSchema, body);
    return this.service.returnItem(tenantOf(principal), id as Uuid, dto.returnedDate);
  }

  @RequirePermissions(CIRCULATION_WRITE)
  @Post(":id/mark-lost")
  @HttpCode(200)
  async markLost(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Loan> {
    return this.service.markLost(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(CIRCULATION_READ)
  @Get(":id/due-status/:asOfDate")
  async dueStatus(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("asOfDate") asOfDate: string,
  ): Promise<LoanDueStatus> {
    return this.service.dueStatus(tenantOf(principal), id as Uuid, asOfDate);
  }

  @RequirePermissions(CIRCULATION_READ)
  @Get("active/by-member/:memberId")
  async listActiveForMember(
    @CurrentPrincipal() principal: Principal,
    @Param("memberId") memberId: string,
  ): Promise<Loan[]> {
    return this.service.listActiveForMember(tenantOf(principal), memberId as Uuid);
  }

  @RequirePermissions(CIRCULATION_READ)
  @Get("by-member/:memberId")
  async listForMember(
    @CurrentPrincipal() principal: Principal,
    @Param("memberId") memberId: string,
  ): Promise<Loan[]> {
    return this.service.listForMember(tenantOf(principal), memberId as Uuid);
  }

  @RequirePermissions(CIRCULATION_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Loan[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(CIRCULATION_READ)
  @Get(":id")
  async getById(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Loan> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
