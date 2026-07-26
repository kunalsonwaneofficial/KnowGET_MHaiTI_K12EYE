import type { Principal } from "@knowget/auth";
import { type AdmissionEvaluation, AdmissionEvaluationService } from "@knowget/admissions";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ADMISSIONS_READ, ADMISSIONS_WRITE, parseBody, tenantOf } from "./admissions-http";
import { recordEvaluationSchema } from "./admissions.dto";
import { AD_EVALUATION_SERVICE } from "./admissions.tokens";

/** REST surface for admission evaluations (P2-D23) — the append-only screening log. admissions:*; tenant-scoped. */
@Controller("admissions/evaluations")
export class AdmissionEvaluationController {
  constructor(
    @Inject(AD_EVALUATION_SERVICE) private readonly service: AdmissionEvaluationService,
  ) {}

  @RequirePermissions(ADMISSIONS_WRITE)
  @Post()
  @HttpCode(201)
  async record(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<AdmissionEvaluation> {
    const dto = parseBody(recordEvaluationSchema, body);
    return this.service.record({
      tenantId: tenantOf(principal),
      applicationId: dto.applicationId as Uuid,
      type: dto.type,
      score: dto.score,
      recommendation: dto.recommendation,
      evaluatedOn: dto.evaluatedOn,
    });
  }

  @RequirePermissions(ADMISSIONS_READ)
  @Get("by-application/:applicationId")
  async listForApplication(
    @CurrentPrincipal() principal: Principal,
    @Param("applicationId") applicationId: string,
  ): Promise<AdmissionEvaluation[]> {
    return this.service.listForApplication(tenantOf(principal), applicationId as Uuid);
  }

  @RequirePermissions(ADMISSIONS_READ)
  @Get("by-application/:applicationId/count")
  async countForApplication(
    @CurrentPrincipal() principal: Principal,
    @Param("applicationId") applicationId: string,
  ): Promise<{ count: number }> {
    return {
      count: await this.service.countForApplication(tenantOf(principal), applicationId as Uuid),
    };
  }
}
