import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { AutomationRunController } from "./automation-run.controller";
import { AutomationRuleController } from "./automation-rule.controller";
import { DecisionOperationsController } from "./decision-operations.controller";
import { DecisionIntelligenceModule } from "./decision-intelligence.module";
import {
  DI_AUTOMATION_RUN_SERVICE,
  DI_AUTOMATION_SERVICE,
  DI_CAPABILITY_DIRECTORY,
  DI_DECISION_SERVICE,
  DI_EVIDENCE_SOURCE_DIRECTORY,
  DI_OPERATIONS_SERVICE,
  DI_ORGANIZATION_DIRECTORY,
  DI_RECOMMENDATION_SERVICE,
  DI_WORKFLOW_RUN_SERVICE,
  DI_WORKFLOW_SERVICE,
} from "./decision-intelligence.tokens";
import { DecisionController } from "./decision.controller";
import { RecommendationController } from "./recommendation.controller";
import { WorkflowRunController } from "./workflow-run.controller";
import { WorkflowController } from "./workflow.controller";

/**
 * Stands in for the global platform providers (database handle, event bus) the domain modules inject, so the
 * decision-intelligence DI graph — including the imported Organization, Knowledge Graph and Agent Orchestration
 * modules — compiles without a live database. The Prisma adapters only store the handle at construction.
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

describe("DecisionIntelligenceModule (integration)", () => {
  it("compiles the full decision, workflow and automation DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, DecisionIntelligenceModule],
    }).compile();

    expect(moduleRef.get(RecommendationController)).toBeInstanceOf(RecommendationController);
    expect(moduleRef.get(DecisionController)).toBeInstanceOf(DecisionController);
    expect(moduleRef.get(WorkflowController)).toBeInstanceOf(WorkflowController);
    expect(moduleRef.get(WorkflowRunController)).toBeInstanceOf(WorkflowRunController);
    expect(moduleRef.get(AutomationRuleController)).toBeInstanceOf(AutomationRuleController);
    expect(moduleRef.get(AutomationRunController)).toBeInstanceOf(AutomationRunController);
    expect(moduleRef.get(DecisionOperationsController)).toBeInstanceOf(
      DecisionOperationsController,
    );

    await moduleRef.close();
  });

  it("exposes each aggregate's application service (and the operations view) for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, DecisionIntelligenceModule],
    }).compile();

    for (const token of [
      DI_RECOMMENDATION_SERVICE,
      DI_DECISION_SERVICE,
      DI_WORKFLOW_SERVICE,
      DI_WORKFLOW_RUN_SERVICE,
      DI_AUTOMATION_SERVICE,
      DI_AUTOMATION_RUN_SERVICE,
      DI_OPERATIONS_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });

  /**
   * The three cross-domain reads are the reason this module imports three others, and each is the enforcement
   * point for something the contract requires rather than a convenience: organization existence, capability
   * invocability against the P2-D26 catalog, and evidence resolution against the graph and the reasoning record.
   * Resolving them here proves the wiring exists — a directory that silently failed to bind would turn "checked"
   * into "assumed" everywhere downstream, and every check in the domain would still pass.
   */
  it("binds the organization, capability and evidence-source directories", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, DecisionIntelligenceModule],
    }).compile();

    for (const token of [
      DI_ORGANIZATION_DIRECTORY,
      DI_CAPABILITY_DIRECTORY,
      DI_EVIDENCE_SOURCE_DIRECTORY,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
