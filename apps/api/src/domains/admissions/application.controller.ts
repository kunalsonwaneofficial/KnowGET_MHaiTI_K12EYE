import type { Principal } from "@knowget/auth";
import { type Application, ApplicationService } from "@knowget/admissions";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ADMISSIONS_READ, ADMISSIONS_WRITE, parseBody, tenantOf } from "./admissions-http";
import { decideApplicationSchema, submitApplicationSchema } from "./admissions.dto";
import { AD_APPLICATION_SERVICE } from "./admissions.tokens";

/** REST surface for admission applications (P2-D23). Gated by admissions:*; tenant-scoped. */
@Controller("admissions/applications")
export class ApplicationController {
  constructor(@Inject(AD_APPLICATION_SERVICE) private readonly service: ApplicationService) {}

  @RequirePermissions(ADMISSIONS_WRITE)
  @Post()
  @HttpCode(201)
  async submit(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Application> {
    const dto = parseBody(submitApplicationSchema, body);
    return this.service.submit({
      tenantId: tenantOf(principal),
      cycleId: dto.cycleId as Uuid,
      applicantPersonId: dto.applicantPersonId as Uuid,
      code: dto.code,
      gradeApplyingFor: dto.gradeApplyingFor,
      submittedOn: dto.submittedOn,
      leadId: (dto.leadId ?? null) as Uuid | null,
    });
  }

  @RequirePermissions(ADMISSIONS_WRITE)
  @Post(":id/review")
  @HttpCode(200)
  async startReview(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Application> {
    return this.service.startReview(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ADMISSIONS_WRITE)
  @Post(":id/interview")
  @HttpCode(200)
  async scheduleInterview(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Application> {
    return this.service.scheduleInterview(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ADMISSIONS_WRITE)
  @Post(":id/offer")
  @HttpCode(200)
  async offer(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Application> {
    const dto = parseBody(decideApplicationSchema, body);
    return this.service.offer(tenantOf(principal), id as Uuid, dto.decidedOn);
  }

  @RequirePermissions(ADMISSIONS_WRITE)
  @Post(":id/waitlist")
  @HttpCode(200)
  async waitlist(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Application> {
    const dto = parseBody(decideApplicationSchema, body);
    return this.service.waitlist(tenantOf(principal), id as Uuid, dto.decidedOn);
  }

  @RequirePermissions(ADMISSIONS_WRITE)
  @Post(":id/reject")
  @HttpCode(200)
  async reject(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Application> {
    const dto = parseBody(decideApplicationSchema, body);
    return this.service.reject(tenantOf(principal), id as Uuid, dto.decidedOn);
  }

  @RequirePermissions(ADMISSIONS_WRITE)
  @Post(":id/withdraw")
  @HttpCode(200)
  async withdraw(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Application> {
    const dto = parseBody(decideApplicationSchema, body);
    return this.service.withdraw(tenantOf(principal), id as Uuid, dto.decidedOn);
  }

  @RequirePermissions(ADMISSIONS_READ)
  @Get("by-code/:code")
  async getByCode(
    @CurrentPrincipal() principal: Principal,
    @Param("code") code: string,
  ): Promise<Application> {
    return this.service.getByCode(tenantOf(principal), code);
  }

  @RequirePermissions(ADMISSIONS_READ)
  @Get("by-cycle/:cycleId")
  async listForCycle(
    @CurrentPrincipal() principal: Principal,
    @Param("cycleId") cycleId: string,
  ): Promise<Application[]> {
    return this.service.listForCycle(tenantOf(principal), cycleId as Uuid);
  }

  @RequirePermissions(ADMISSIONS_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Application[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(ADMISSIONS_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Application> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
