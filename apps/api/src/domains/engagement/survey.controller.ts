import type { Principal } from "@knowget/auth";
import { type Survey, type SurveyQuestion, SurveyService } from "@knowget/engagement";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ENGAGEMENT_READ, ENGAGEMENT_WRITE, parseBody, tenantOf } from "./engagement-http";
import {
  closeSurveySchema,
  createSurveySchema,
  editSurveyQuestionsSchema,
  openSurveySchema,
  setSurveyTitleSchema,
} from "./engagement.dto";
import { EN_SURVEY_SERVICE } from "./engagement.tokens";

/** REST surface for surveys (P2-D22). Gated by engagement:*; tenant-scoped. */
@Controller("engagement/surveys")
export class SurveyController {
  constructor(@Inject(EN_SURVEY_SERVICE) private readonly service: SurveyService) {}

  @RequirePermissions(ENGAGEMENT_WRITE)
  @Post()
  @HttpCode(201)
  async create(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Survey> {
    const dto = parseBody(createSurveySchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      audienceId: dto.audienceId as Uuid,
      title: dto.title,
      type: dto.type,
      questions: dto.questions as SurveyQuestion[],
    });
  }

  @RequirePermissions(ENGAGEMENT_WRITE)
  @Post(":id/questions")
  @HttpCode(200)
  async editQuestions(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Survey> {
    const dto = parseBody(editSurveyQuestionsSchema, body);
    return this.service.editQuestions(
      tenantOf(principal),
      id as Uuid,
      dto.questions as SurveyQuestion[],
    );
  }

  @RequirePermissions(ENGAGEMENT_WRITE)
  @Post(":id/title")
  @HttpCode(200)
  async setTitle(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Survey> {
    const dto = parseBody(setSurveyTitleSchema, body);
    return this.service.setTitle(tenantOf(principal), id as Uuid, dto.title);
  }

  @RequirePermissions(ENGAGEMENT_WRITE)
  @Post(":id/open")
  @HttpCode(200)
  async open(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Survey> {
    const dto = parseBody(openSurveySchema, body);
    return this.service.open(tenantOf(principal), id as Uuid, dto.opensAt);
  }

  @RequirePermissions(ENGAGEMENT_WRITE)
  @Post(":id/close")
  @HttpCode(200)
  async close(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Survey> {
    const dto = parseBody(closeSurveySchema, body);
    return this.service.close(tenantOf(principal), id as Uuid, dto.closesAt);
  }

  @RequirePermissions(ENGAGEMENT_WRITE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Survey> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(ENGAGEMENT_READ)
  @Get("by-audience/:audienceId")
  async listForAudience(
    @CurrentPrincipal() principal: Principal,
    @Param("audienceId") audienceId: string,
  ): Promise<Survey[]> {
    return this.service.listForAudience(tenantOf(principal), audienceId as Uuid);
  }

  @RequirePermissions(ENGAGEMENT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Survey[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(ENGAGEMENT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Survey> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
