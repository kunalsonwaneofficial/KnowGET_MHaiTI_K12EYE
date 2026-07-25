import type { Principal } from "@knowget/auth";
import {
  type WorkforceProfile,
  WorkforceProfileService,
  type WorkforceSummary,
} from "@knowget/workforce";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { refreshProfileSchema } from "./workforce.dto";
import { parseBody, tenantOf, WORKFORCE_READ, WORKFORCE_WRITE } from "./workforce-http";
import { WF_PROFILE_SERVICE } from "./workforce.tokens";

/**
 * REST surface for the workforce profile (P2-D12) — the descriptive, AI-ready indicator snapshot per
 * employee and the organization rollup. Gated by workforce:*; tenant-scoped. Descriptive only, never
 * a prediction (P2-D28).
 */
@Controller("workforce/profiles")
export class WorkforceProfileController {
  constructor(@Inject(WF_PROFILE_SERVICE) private readonly service: WorkforceProfileService) {}

  @RequirePermissions(WORKFORCE_WRITE)
  @Post("by-employee/:employeeId/refresh")
  @HttpCode(200)
  async refresh(
    @CurrentPrincipal() principal: Principal,
    @Param("employeeId") employeeId: string,
    @Body() body: unknown,
  ): Promise<WorkforceProfile> {
    const dto = parseBody(refreshProfileSchema, body);
    return this.service.refresh(tenantOf(principal), employeeId as Uuid, dto.asOf, dto.period);
  }

  @RequirePermissions(WORKFORCE_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<WorkforceProfile[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(WORKFORCE_READ)
  @Get("by-employee/:employeeId")
  async getByEmployee(
    @CurrentPrincipal() principal: Principal,
    @Param("employeeId") employeeId: string,
  ): Promise<WorkforceProfile | null> {
    return this.service.getByEmployee(tenantOf(principal), employeeId as Uuid);
  }

  @RequirePermissions(WORKFORCE_READ)
  @Get("summary/:organizationId/:asOf")
  async summarizeOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
    @Param("asOf") asOf: string,
  ): Promise<WorkforceSummary> {
    return this.service.summarizeOrganization(tenantOf(principal), organizationId as Uuid, asOf);
  }

  @RequirePermissions(WORKFORCE_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<WorkforceProfile> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
