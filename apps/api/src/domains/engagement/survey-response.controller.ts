import type { Principal } from "@knowget/auth";
import { type SurveyResponse, SurveyResponseService } from "@knowget/engagement";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ENGAGEMENT_READ, ENGAGEMENT_WRITE, parseBody, tenantOf } from "./engagement-http";
import { submitResponseSchema } from "./engagement.dto";
import { EN_RESPONSE_SERVICE } from "./engagement.tokens";

/** REST surface for survey responses (P2-D22). Gated by engagement:*; tenant-scoped. */
@Controller("engagement/survey-responses")
export class SurveyResponseController {
  constructor(@Inject(EN_RESPONSE_SERVICE) private readonly service: SurveyResponseService) {}

  @RequirePermissions(ENGAGEMENT_WRITE)
  @Post()
  @HttpCode(201)
  async submit(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<SurveyResponse> {
    const dto = parseBody(submitResponseSchema, body);
    return this.service.submit({
      tenantId: tenantOf(principal),
      surveyId: dto.surveyId as Uuid,
      respondentPersonId: (dto.respondentPersonId ?? null) as Uuid | null,
      answers: dto.answers,
      submittedAt: dto.submittedAt,
    });
  }

  @RequirePermissions(ENGAGEMENT_READ)
  @Get("by-survey/:surveyId/count")
  async countForSurvey(
    @CurrentPrincipal() principal: Principal,
    @Param("surveyId") surveyId: string,
  ): Promise<{ count: number }> {
    const count = await this.service.countForSurvey(tenantOf(principal), surveyId as Uuid);
    return { count };
  }

  @RequirePermissions(ENGAGEMENT_READ)
  @Get("by-survey/:surveyId")
  async listForSurvey(
    @CurrentPrincipal() principal: Principal,
    @Param("surveyId") surveyId: string,
  ): Promise<SurveyResponse[]> {
    return this.service.listForSurvey(tenantOf(principal), surveyId as Uuid);
  }
}
