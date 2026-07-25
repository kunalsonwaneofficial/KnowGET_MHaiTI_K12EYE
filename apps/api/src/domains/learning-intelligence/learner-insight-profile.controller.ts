import type { Principal } from "@knowget/auth";
import {
  type LearnerInsightProfile,
  LearnerInsightProfileService,
} from "@knowget/learning-intelligence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ensureProfileSchema } from "./learning-intelligence.dto";
import { INSIGHT_READ, INSIGHT_WRITE, parseBody, tenantOf } from "./learning-intelligence-http";
import { LI_PROFILE_SERVICE } from "./learning-intelligence.tokens";

/** REST surface for learner insight profiles (P2-D11). Gated by insight:*; tenant-scoped. */
@Controller("learning-intelligence/profiles")
export class LearnerInsightProfileController {
  constructor(@Inject(LI_PROFILE_SERVICE) private readonly service: LearnerInsightProfileService) {}

  @RequirePermissions(INSIGHT_WRITE)
  @Post()
  @HttpCode(201)
  async ensure(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<LearnerInsightProfile> {
    const dto = parseBody(ensureProfileSchema, body);
    return this.service.ensure(
      tenantOf(principal),
      dto.organizationId as Uuid,
      dto.studentId as Uuid,
    );
  }

  @RequirePermissions(INSIGHT_WRITE)
  @Post("refresh")
  @HttpCode(200)
  async refreshForStudent(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<LearnerInsightProfile> {
    const dto = parseBody(ensureProfileSchema, body);
    return this.service.refreshForStudent(
      tenantOf(principal),
      dto.organizationId as Uuid,
      dto.studentId as Uuid,
    );
  }

  @RequirePermissions(INSIGHT_WRITE)
  @Post(":id/refresh")
  @HttpCode(200)
  async refresh(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<LearnerInsightProfile> {
    return this.service.refresh(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(INSIGHT_READ)
  @Get("by-student/:studentId")
  async getByStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<LearnerInsightProfile | null> {
    return this.service.getByStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(INSIGHT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<LearnerInsightProfile[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(INSIGHT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<LearnerInsightProfile> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
