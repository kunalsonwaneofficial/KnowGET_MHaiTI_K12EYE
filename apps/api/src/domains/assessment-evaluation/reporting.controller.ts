import {
  type CompetencyReport,
  type ReportCard,
  ReportingService,
  type Transcript,
} from "@knowget/assessment-evaluation";
import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { Controller, Get, Inject, Param } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { ASSESSMENT_READ, tenantOf } from "./assessment-evaluation-http";
import { AE_REPORTING_SERVICE } from "./assessment-evaluation.tokens";

/**
 * REST surface for academic reporting (P2-D10) — read-only term report cards, cumulative
 * transcripts and competency reports projected from the persisted academic records and competency
 * profiles. Gated by assessment:read; tenant-scoped.
 */
@Controller("assessment-evaluation/reports")
export class ReportingController {
  constructor(@Inject(AE_REPORTING_SERVICE) private readonly service: ReportingService) {}

  @RequirePermissions(ASSESSMENT_READ)
  @Get("report-card/:studentId/:academicYear/:term")
  async reportCard(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
    @Param("academicYear") academicYear: string,
    @Param("term") term: string,
  ): Promise<ReportCard> {
    return this.service.generateReportCard(
      tenantOf(principal),
      studentId as Uuid,
      academicYear,
      term,
    );
  }

  @RequirePermissions(ASSESSMENT_READ)
  @Get("transcript/:studentId")
  async transcript(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<Transcript> {
    return this.service.generateTranscript(tenantOf(principal), studentId as Uuid);
  }

  @RequirePermissions(ASSESSMENT_READ)
  @Get("competency-report/:studentId")
  async competencyReport(
    @CurrentPrincipal() principal: Principal,
    @Param("studentId") studentId: string,
  ): Promise<CompetencyReport> {
    return this.service.generateCompetencyReport(tenantOf(principal), studentId as Uuid);
  }
}
