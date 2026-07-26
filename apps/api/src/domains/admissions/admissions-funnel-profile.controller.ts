import type { Principal } from "@knowget/auth";
import {
  type AdmissionFunnel,
  type AdmissionsFunnelProfile,
  AdmissionsFunnelProfileService,
  type GradeIntakeCapacity,
} from "@knowget/admissions";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ADMISSIONS_READ, ADMISSIONS_WRITE, parseBody, tenantOf } from "./admissions-http";
import { refreshFunnelProfileSchema } from "./admissions.dto";
import { AD_PROFILE_SERVICE } from "./admissions.tokens";

/** REST surface for admissions funnel profiles (P2-D23). Gated by admissions:*; tenant-scoped. */
@Controller("admissions/funnel-profiles")
export class AdmissionsFunnelProfileController {
  constructor(
    @Inject(AD_PROFILE_SERVICE) private readonly service: AdmissionsFunnelProfileService,
  ) {}

  @RequirePermissions(ADMISSIONS_WRITE)
  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<AdmissionsFunnelProfile> {
    const dto = parseBody(refreshFunnelProfileSchema, body);
    return this.service.refreshForCycle(tenantOf(principal), dto.cycleId as Uuid);
  }

  @RequirePermissions(ADMISSIONS_READ)
  @Get("by-cycle/:cycleId")
  async getForCycle(
    @CurrentPrincipal() principal: Principal,
    @Param("cycleId") cycleId: string,
  ): Promise<AdmissionsFunnelProfile | null> {
    return this.service.getForCycle(tenantOf(principal), cycleId as Uuid);
  }

  @RequirePermissions(ADMISSIONS_READ)
  @Get("by-cycle/:cycleId/funnel")
  async funnelForCycle(
    @CurrentPrincipal() principal: Principal,
    @Param("cycleId") cycleId: string,
  ): Promise<AdmissionFunnel> {
    return this.service.funnelForCycle(tenantOf(principal), cycleId as Uuid);
  }

  @RequirePermissions(ADMISSIONS_READ)
  @Get("by-cycle/:cycleId/intake")
  async intakeByGrade(
    @CurrentPrincipal() principal: Principal,
    @Param("cycleId") cycleId: string,
  ): Promise<GradeIntakeCapacity[]> {
    return this.service.intakeByGrade(tenantOf(principal), cycleId as Uuid);
  }
}
