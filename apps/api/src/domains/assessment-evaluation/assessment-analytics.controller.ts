import {
  AssessmentAnalyticsService,
  type AssessmentIndicators,
} from "@knowget/assessment-evaluation";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { Controller, Get, Inject, Param } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ASSESSMENT_READ, tenantOf } from "./assessment-evaluation-http";
import { AE_ANALYTICS_SERVICE } from "./assessment-evaluation.tokens";

/**
 * REST surface for assessment analytics (P2-D10) — read-only descriptive indicators (assessment
 * and evaluation throughput, average performance and consistency, competency mastery, learning
 * gaps and curriculum coverage) computed over the persisted aggregates for a subject, learner or
 * organization. Gated by assessment:read; tenant-scoped.
 */
@Controller("assessment-evaluation/analytics")
export class AssessmentAnalyticsController {
  constructor(@Inject(AE_ANALYTICS_SERVICE) private readonly service: AssessmentAnalyticsService) {}

  @RequirePermissions(ASSESSMENT_READ)
  @Get("by-subject/:subjectId")
  async forSubject(
    @CurrentPrincipal() principal: Principal,
    @Param("subjectId") subjectId: string,
  ): Promise<AssessmentIndicators> {
    return this.service.forSubject(tenantOf(principal), subjectId as Uuid);
  }

  @RequirePermissions(ASSESSMENT_READ)
  @Get("by-student/:studentId")
  async forStudent(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<AssessmentIndicators> {
    return this.service.forStudent(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(ASSESSMENT_READ)
  @Get("by-organization/:organizationId")
  async forOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<AssessmentIndicators> {
    return this.service.forOrganization(tenantOf(principal), organizationId as Uuid);
  }
}
