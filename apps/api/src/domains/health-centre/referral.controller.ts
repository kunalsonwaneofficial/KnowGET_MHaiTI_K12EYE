import type { Principal } from "@knowget/auth";
import { type Referral, ReferralService } from "@knowget/health-centre";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { CLINICAL_READ, CLINICAL_WRITE, parseBody, tenantOf } from "./health-centre-http";
import { raiseReferralSchema } from "./health-centre.dto";
import { HC_REFERRAL_SERVICE } from "./health-centre.tokens";

/** REST surface for referrals (P2-D19). Gated by clinical:*; tenant-scoped. */
@Controller("clinical/referrals")
export class ReferralController {
  constructor(@Inject(HC_REFERRAL_SERVICE) private readonly service: ReferralService) {}

  @RequirePermissions(CLINICAL_WRITE)
  @Post()
  @HttpCode(201)
  async raise(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Referral> {
    const dto = parseBody(raiseReferralSchema, body);
    return this.service.raise({
      tenantId: tenantOf(principal),
      centreId: dto.centreId as Uuid,
      patientId: dto.patientId as Uuid,
      referredTo: dto.referredTo,
      urgency: dto.urgency,
      raisedOn: dto.raisedOn,
      reason: dto.reason,
      clinicianId: dto.clinicianId as Uuid | null | undefined,
    });
  }

  @RequirePermissions(CLINICAL_WRITE)
  @Post(":id/accept")
  @HttpCode(200)
  async accept(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Referral> {
    return this.service.accept(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(CLINICAL_WRITE)
  @Post(":id/complete")
  @HttpCode(200)
  async complete(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Referral> {
    return this.service.complete(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(CLINICAL_WRITE)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Referral> {
    return this.service.cancel(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(CLINICAL_READ)
  @Get("by-patient/:patientId")
  async listForPatient(
    @CurrentPrincipal() principal: Principal,
    @Param("patientId") patientId: string,
  ): Promise<Referral[]> {
    return this.service.listForPatient(tenantOf(principal), patientId as Uuid);
  }

  @RequirePermissions(CLINICAL_READ)
  @Get("open/by-centre/:centreId")
  async listOpenForCentre(
    @CurrentPrincipal() principal: Principal,
    @Param("centreId") centreId: string,
  ): Promise<Referral[]> {
    return this.service.listOpenForCentre(tenantOf(principal), centreId as Uuid);
  }

  @RequirePermissions(CLINICAL_READ)
  @Get("by-centre/:centreId")
  async listForCentre(
    @CurrentPrincipal() principal: Principal,
    @Param("centreId") centreId: string,
  ): Promise<Referral[]> {
    return this.service.listForCentre(tenantOf(principal), centreId as Uuid);
  }

  @RequirePermissions(CLINICAL_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Referral> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
