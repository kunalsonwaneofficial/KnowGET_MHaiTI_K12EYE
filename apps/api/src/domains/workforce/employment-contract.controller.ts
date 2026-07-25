import type { Principal } from "@knowget/auth";
import { type EmploymentContract, EmploymentContractService } from "@knowget/workforce";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  issueContractSchema,
  setEndDateSchema,
  setGradeSchema,
  setTermsSchema,
} from "./workforce.dto";
import { parseBody, tenantOf, WORKFORCE_READ, WORKFORCE_WRITE } from "./workforce-http";
import { WF_CONTRACT_SERVICE } from "./workforce.tokens";

/**
 * REST surface for employment contracts (P2-D12) — version control for the employment relationship.
 * Gated by workforce:*; tenant-scoped. Carries the pay grade/band label only (money is Finance).
 */
@Controller("workforce/contracts")
export class EmploymentContractController {
  constructor(@Inject(WF_CONTRACT_SERVICE) private readonly service: EmploymentContractService) {}

  @RequirePermissions(WORKFORCE_WRITE)
  @Post()
  @HttpCode(201)
  async issue(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<EmploymentContract> {
    const dto = parseBody(issueContractSchema, body);
    return this.service.issue({
      tenantId: tenantOf(principal),
      employeeId: dto.employeeId as Uuid,
      employmentType: dto.employmentType,
      startDate: dto.startDate,
      ...(dto.grade !== undefined ? { grade: dto.grade } : {}),
      ...(dto.endDate !== undefined ? { endDate: dto.endDate } : {}),
      ...(dto.terms !== undefined ? { terms: dto.terms } : {}),
    });
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/grade")
  @HttpCode(200)
  async setGrade(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EmploymentContract> {
    const dto = parseBody(setGradeSchema, body);
    return this.service.setGrade(tenantOf(principal), id as Uuid, dto.grade);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/end-date")
  @HttpCode(200)
  async setEndDate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EmploymentContract> {
    const dto = parseBody(setEndDateSchema, body);
    return this.service.setEndDate(tenantOf(principal), id as Uuid, dto.endDate);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/terms")
  @HttpCode(200)
  async setTerms(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EmploymentContract> {
    const dto = parseBody(setTermsSchema, body);
    return this.service.setTerms(tenantOf(principal), id as Uuid, dto.terms);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<EmploymentContract> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/expire")
  @HttpCode(200)
  async expire(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<EmploymentContract> {
    return this.service.expire(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/terminate")
  @HttpCode(200)
  async terminate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<EmploymentContract> {
    return this.service.terminate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WORKFORCE_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<EmploymentContract[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(WORKFORCE_READ)
  @Get("by-employee/:employeeId")
  async listForEmployee(
    @CurrentPrincipal() principal: Principal,
    @Param("employeeId") employeeId: string,
  ): Promise<EmploymentContract[]> {
    return this.service.listForEmployee(tenantOf(principal), employeeId as Uuid);
  }

  @RequirePermissions(WORKFORCE_READ)
  @Get("by-employee/:employeeId/active")
  async getActiveForEmployee(
    @CurrentPrincipal() principal: Principal,
    @Param("employeeId") employeeId: string,
  ): Promise<EmploymentContract | null> {
    return this.service.getActiveForEmployee(tenantOf(principal), employeeId as Uuid);
  }

  @RequirePermissions(WORKFORCE_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<EmploymentContract> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
