import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { AttentionItemController } from "./attention-item.controller";
import { DashboardController } from "./dashboard.controller";
import { ExecutiveBriefingController } from "./executive-briefing.controller";
import { ExecutiveIntelligenceModule } from "./executive-intelligence.module";
import {
  EI_ASSESSMENT_SERVICE,
  EI_ATTENTION_ITEM_SERVICE,
  EI_BRIEFING_SERVICE,
  EI_DASHBOARD_SERVICE,
  EI_EVIDENCE_DIRECTORY,
  EI_INDEX_DEFINITION_SERVICE,
  EI_KPI_DEFINITION_SERVICE,
  EI_KPI_READING_SERVICE,
  EI_ORGANIZATION_DIRECTORY,
} from "./executive-intelligence.tokens";
import { HealthIndexAssessmentController } from "./health-index-assessment.controller";
import { HealthIndexDefinitionController } from "./health-index-definition.controller";
import { KpiDefinitionController } from "./kpi-definition.controller";
import { KpiReadingController } from "./kpi-reading.controller";

/**
 * Stands in for the global platform providers (database handle, event bus) the domain modules inject, so the
 * executive-intelligence DI graph — including the imported Organization, Assessment & Evaluation, Knowledge
 * Graph, Decision Intelligence and Predictive Intelligence modules — compiles without a live database. The
 * Prisma adapters only store the handle at construction.
 */
@Global()
@Module({
  providers: [
    { provide: DATABASE, useValue: {} },
    { provide: EVENT_BUS, useValue: { publish: async () => undefined } },
  ],
  exports: [DATABASE, EVENT_BUS],
})
class MockGlobalsModule {}

describe("ExecutiveIntelligenceModule (integration)", () => {
  it("compiles the full measurement, indexing, command and governance DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, ExecutiveIntelligenceModule],
    }).compile();

    expect(moduleRef.get(KpiDefinitionController)).toBeInstanceOf(KpiDefinitionController);
    expect(moduleRef.get(KpiReadingController)).toBeInstanceOf(KpiReadingController);
    expect(moduleRef.get(HealthIndexDefinitionController)).toBeInstanceOf(
      HealthIndexDefinitionController,
    );
    expect(moduleRef.get(HealthIndexAssessmentController)).toBeInstanceOf(
      HealthIndexAssessmentController,
    );
    expect(moduleRef.get(DashboardController)).toBeInstanceOf(DashboardController);
    expect(moduleRef.get(ExecutiveBriefingController)).toBeInstanceOf(ExecutiveBriefingController);
    expect(moduleRef.get(AttentionItemController)).toBeInstanceOf(AttentionItemController);

    await moduleRef.close();
  });

  it("exposes each aggregate's application service for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, ExecutiveIntelligenceModule],
    }).compile();

    for (const token of [
      EI_KPI_DEFINITION_SERVICE,
      EI_KPI_READING_SERVICE,
      EI_INDEX_DEFINITION_SERVICE,
      EI_ASSESSMENT_SERVICE,
      EI_DASHBOARD_SERVICE,
      EI_BRIEFING_SERVICE,
      EI_ATTENTION_ITEM_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });

  /**
   * The evidence directory is why this module imports four domains beyond the organization node check, and it is
   * the contract's third clause made structural: a citation is resolved through Assessment & Evaluation,
   * Predictive Intelligence, Decision Intelligence or the graph's assertions by kind, and through the knowledge
   * graph by source pair for everything else. Resolving both directories here proves the wiring exists. A
   * directory that silently failed to bind would turn "traceable" into "shaped like a trace" across every
   * reading in the domain, while every guard in the package still appeared to pass.
   */
  it("binds the organization and evidence-record directories", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, ExecutiveIntelligenceModule],
    }).compile();

    for (const token of [EI_ORGANIZATION_DIRECTORY, EI_EVIDENCE_DIRECTORY]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
