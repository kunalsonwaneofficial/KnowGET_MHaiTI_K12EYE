import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { AdoptionReviewController } from "./adoption-review.controller";
import { GovernanceDecisionController } from "./governance-decision.controller";
import { ImprovementCycleController } from "./improvement-cycle.controller";
import { ImprovementInitiativeController } from "./improvement-initiative.controller";
import { ImprovementSignalController } from "./improvement-signal.controller";
import { LessonController } from "./lesson.controller";
import { MaturityAssessmentController } from "./maturity-assessment.controller";
import { PlatformEvolutionModule } from "./platform-evolution.module";
import {
  PE_ADOPTION_REVIEW_SERVICE,
  PE_ASSESSMENT_SERVICE,
  PE_CYCLE_SERVICE,
  PE_DECISION_SERVICE,
  PE_EVIDENCE_DIRECTORY,
  PE_INITIATIVE_SERVICE,
  PE_LESSON_SERVICE,
  PE_MEMORY_DIRECTORY,
  PE_ORGANIZATION_DIRECTORY,
  PE_PERSON_DIRECTORY,
  PE_SIGNAL_SERVICE,
} from "./platform-evolution.tokens";

/**
 * Stands in for the global platform providers (database handle, event bus) the domain modules inject, so the
 * platform-evolution DI graph — including the imported Organization, Person, Knowledge Graph, Assessment &
 * Evaluation, Decision Intelligence, Predictive Intelligence and Executive Intelligence modules — compiles
 * without a live database. The Prisma adapters only store the handle at construction.
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

describe("PlatformEvolutionModule (integration)", () => {
  it("compiles the full intake, governance, learning and improvement DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, PlatformEvolutionModule],
    }).compile();

    expect(moduleRef.get(ImprovementSignalController)).toBeInstanceOf(ImprovementSignalController);
    expect(moduleRef.get(ImprovementInitiativeController)).toBeInstanceOf(
      ImprovementInitiativeController,
    );
    expect(moduleRef.get(GovernanceDecisionController)).toBeInstanceOf(
      GovernanceDecisionController,
    );
    expect(moduleRef.get(LessonController)).toBeInstanceOf(LessonController);
    expect(moduleRef.get(ImprovementCycleController)).toBeInstanceOf(ImprovementCycleController);
    expect(moduleRef.get(MaturityAssessmentController)).toBeInstanceOf(
      MaturityAssessmentController,
    );
    expect(moduleRef.get(AdoptionReviewController)).toBeInstanceOf(AdoptionReviewController);

    await moduleRef.close();
  });

  it("exposes each aggregate's application service for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, PlatformEvolutionModule],
    }).compile();

    for (const token of [
      PE_SIGNAL_SERVICE,
      PE_INITIATIVE_SERVICE,
      PE_DECISION_SERVICE,
      PE_LESSON_SERVICE,
      PE_CYCLE_SERVICE,
      PE_ASSESSMENT_SERVICE,
      PE_ADOPTION_REVIEW_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });

  /**
   * The four directories are why this module imports seven domains, and two of them carry the contract's rule
   * rather than a convenience. The evidence directory is what makes a citation resolvable rather than merely
   * well-shaped; the memory directory is what makes a lesson's retention a fact read off the institutional
   * knowledge graph rather than a status somebody set. A directory that silently failed to bind would turn
   * "grounded in evidence" and "entered institutional memory" into claims nothing checked, while every guard in
   * the package still appeared to pass — which is exactly the failure this contract exists to prevent.
   */
  it("binds the organization, person, evidence and institutional-memory directories", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, PlatformEvolutionModule],
    }).compile();

    for (const token of [
      PE_ORGANIZATION_DIRECTORY,
      PE_PERSON_DIRECTORY,
      PE_EVIDENCE_DIRECTORY,
      PE_MEMORY_DIRECTORY,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
