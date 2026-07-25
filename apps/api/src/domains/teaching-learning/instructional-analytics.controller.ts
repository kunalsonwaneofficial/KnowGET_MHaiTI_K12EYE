import type { Principal } from "@knowget/auth";
import {
  InstructionalAnalyticsService,
  type InstructionalIndicators,
} from "@knowget/teaching-learning";
import type { Uuid } from "@knowget/types";
import { Controller, Get, Inject, Param } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { TEACHING_READ, tenantOf } from "./teaching-learning-http";
import { TL_ANALYTICS_SERVICE } from "./teaching-learning.tokens";

/**
 * REST surface for instructional analytics (P2-D09) — read-only descriptive indicators
 * (curriculum coverage, lesson completion, teaching consistency, engagement, pace, resource
 * utilisation, submission rate, workload) computed over the persisted aggregates for a subject,
 * section or organization. Gated by teaching:read; tenant-scoped.
 */
@Controller("teaching-learning/analytics")
export class InstructionalAnalyticsController {
  constructor(
    @Inject(TL_ANALYTICS_SERVICE) private readonly service: InstructionalAnalyticsService,
  ) {}

  @RequirePermissions(TEACHING_READ)
  @Get("by-subject/:subjectId")
  async forSubject(
    @CurrentPrincipal() principal: Principal,
    @Param("subjectId") subjectId: string,
  ): Promise<InstructionalIndicators> {
    return this.service.forSubject(tenantOf(principal), subjectId as Uuid);
  }

  @RequirePermissions(TEACHING_READ)
  @Get("by-section/:sectionId")
  async forSection(
    @CurrentPrincipal() principal: Principal,
    @Param("sectionId") sectionId: string,
  ): Promise<InstructionalIndicators> {
    return this.service.forSection(tenantOf(principal), sectionId as Uuid);
  }

  @RequirePermissions(TEACHING_READ)
  @Get("by-organization/:organizationId")
  async forOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<InstructionalIndicators> {
    return this.service.forOrganization(tenantOf(principal), organizationId as Uuid);
  }
}
