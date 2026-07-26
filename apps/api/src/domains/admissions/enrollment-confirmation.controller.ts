import type { Principal } from "@knowget/auth";
import { type EnrollmentConfirmation, EnrollmentConfirmationService } from "@knowget/admissions";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ADMISSIONS_READ, ADMISSIONS_WRITE, parseBody, tenantOf } from "./admissions-http";
import { confirmEnrollmentSchema } from "./admissions.dto";
import { AD_ENROLLMENT_SERVICE } from "./admissions.tokens";

/** REST surface for enrollment confirmations (P2-D23) — the close of the funnel. admissions:*; tenant-scoped. */
@Controller("admissions/enrollments")
export class EnrollmentConfirmationController {
  constructor(
    @Inject(AD_ENROLLMENT_SERVICE) private readonly service: EnrollmentConfirmationService,
  ) {}

  @RequirePermissions(ADMISSIONS_WRITE)
  @Post()
  @HttpCode(201)
  async confirm(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<EnrollmentConfirmation> {
    const dto = parseBody(confirmEnrollmentSchema, body);
    return this.service.confirm({
      tenantId: tenantOf(principal),
      offerId: dto.offerId as Uuid,
      confirmedOn: dto.confirmedOn,
      studentId: (dto.studentId ?? null) as Uuid | null,
    });
  }

  @RequirePermissions(ADMISSIONS_READ)
  @Get("by-offer/:offerId")
  async getByOffer(
    @CurrentPrincipal() principal: Principal,
    @Param("offerId") offerId: string,
  ): Promise<EnrollmentConfirmation | null> {
    return this.service.getByOffer(tenantOf(principal), offerId as Uuid);
  }

  @RequirePermissions(ADMISSIONS_READ)
  @Get("by-cycle/:cycleId")
  async listForCycle(
    @CurrentPrincipal() principal: Principal,
    @Param("cycleId") cycleId: string,
  ): Promise<EnrollmentConfirmation[]> {
    return this.service.listForCycle(tenantOf(principal), cycleId as Uuid);
  }

  @RequirePermissions(ADMISSIONS_READ)
  @Get("by-cycle/:cycleId/count")
  async countForCycle(
    @CurrentPrincipal() principal: Principal,
    @Param("cycleId") cycleId: string,
  ): Promise<{ count: number }> {
    return { count: await this.service.countForCycle(tenantOf(principal), cycleId as Uuid) };
  }

  @RequirePermissions(ADMISSIONS_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<EnrollmentConfirmation | null> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
