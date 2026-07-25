import type { Principal } from "@knowget/auth";
import {
  type CohortInsight,
  CohortInsightService,
  type CohortScopeType,
} from "@knowget/learning-intelligence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { createCohortSchema, setMembersSchema } from "./learning-intelligence.dto";
import { INSIGHT_READ, INSIGHT_WRITE, parseBody, tenantOf } from "./learning-intelligence-http";
import { LI_COHORT_SERVICE } from "./learning-intelligence.tokens";

/** REST surface for cohort insights (P2-D11). Gated by insight:*; tenant-scoped. */
@Controller("learning-intelligence/cohort-insights")
export class CohortInsightController {
  constructor(@Inject(LI_COHORT_SERVICE) private readonly service: CohortInsightService) {}

  @RequirePermissions(INSIGHT_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<CohortInsight> {
    const dto = parseBody(createCohortSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      scopeType: dto.scopeType,
      scopeId: dto.scopeId as Uuid,
      label: dto.label,
      ...(dto.memberStudentIds !== undefined
        ? { memberStudentIds: dto.memberStudentIds as Uuid[] }
        : {}),
    });
  }

  @RequirePermissions(INSIGHT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<CohortInsight[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(INSIGHT_READ)
  @Get("by-scope/:scopeType/:scopeId")
  async getByScope(
    @CurrentPrincipal() principal: Principal,
    @Param("scopeType") scopeType: string,
    @Param("scopeId") scopeId: string,
  ): Promise<CohortInsight | null> {
    return this.service.getByScope(
      tenantOf(principal),
      scopeType as CohortScopeType,
      scopeId as Uuid,
    );
  }

  @RequirePermissions(INSIGHT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<CohortInsight> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(INSIGHT_WRITE)
  @Post(":id/members")
  @HttpCode(200)
  async setMembers(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<CohortInsight> {
    const dto = parseBody(setMembersSchema, body);
    return this.service.setMembers(tenantOf(principal), id as Uuid, dto.memberStudentIds as Uuid[]);
  }

  @RequirePermissions(INSIGHT_WRITE)
  @Post(":id/refresh")
  @HttpCode(200)
  async refresh(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<CohortInsight> {
    return this.service.refresh(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(INSIGHT_WRITE)
  @Post(":id/publish")
  @HttpCode(200)
  async publish(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<CohortInsight> {
    return this.service.publish(tenantOf(principal), id as Uuid);
  }
}
