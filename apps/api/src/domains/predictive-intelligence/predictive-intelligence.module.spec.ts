import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { BacktestController } from "./backtest.controller";
import { ForecastModelController } from "./forecast-model.controller";
import { ForecastRunController } from "./forecast-run.controller";
import { ObservationSeriesController } from "./observation-series.controller";
import { PredictiveIntelligenceModule } from "./predictive-intelligence.module";
import {
  PI_BACKTEST_SERVICE,
  PI_FORECAST_RUN_SERVICE,
  PI_MODEL_SERVICE,
  PI_ORGANIZATION_DIRECTORY,
  PI_PERSON_DIRECTORY,
  PI_PLAN_SERVICE,
  PI_SCENARIO_SERVICE,
  PI_SERIES_SERVICE,
  PI_SIMULATION_RUN_SERVICE,
  PI_SUBJECT_DIRECTORY,
} from "./predictive-intelligence.tokens";
import { ScenarioController } from "./scenario.controller";
import { SimulationRunController } from "./simulation-run.controller";
import { StrategicPlanController } from "./strategic-plan.controller";

/**
 * Stands in for the global platform providers (database handle, event bus) the domain modules inject, so the
 * predictive-intelligence DI graph — including the imported Organization, Person, Student Lifecycle and
 * Knowledge Graph modules — compiles without a live database. The Prisma adapters only store the handle at
 * construction.
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

describe("PredictiveIntelligenceModule (integration)", () => {
  it("compiles the full forecasting, simulation and planning DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, PredictiveIntelligenceModule],
    }).compile();

    expect(moduleRef.get(ObservationSeriesController)).toBeInstanceOf(ObservationSeriesController);
    expect(moduleRef.get(ForecastModelController)).toBeInstanceOf(ForecastModelController);
    expect(moduleRef.get(ForecastRunController)).toBeInstanceOf(ForecastRunController);
    expect(moduleRef.get(BacktestController)).toBeInstanceOf(BacktestController);
    expect(moduleRef.get(ScenarioController)).toBeInstanceOf(ScenarioController);
    expect(moduleRef.get(SimulationRunController)).toBeInstanceOf(SimulationRunController);
    expect(moduleRef.get(StrategicPlanController)).toBeInstanceOf(StrategicPlanController);

    await moduleRef.close();
  });

  it("exposes each aggregate's application service for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, PredictiveIntelligenceModule],
    }).compile();

    for (const token of [
      PI_SERIES_SERVICE,
      PI_MODEL_SERVICE,
      PI_FORECAST_RUN_SERVICE,
      PI_BACKTEST_SERVICE,
      PI_SCENARIO_SERVICE,
      PI_SIMULATION_RUN_SERVICE,
      PI_PLAN_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });

  /**
   * The three cross-domain reads are why this module imports four others, and each is an enforcement point for
   * something the contract requires rather than a convenience: the organization a series, model, scenario or
   * plan hangs off; the person behind every attributed act and every expert-judgement assumption; and the
   * subject a series is actually about. Resolving them here proves the wiring exists — a directory that
   * silently failed to bind would turn "checked" into "assumed" everywhere downstream, and every guard in the
   * domain would still pass while checking nothing.
   */
  it("binds the organization, person and series-subject directories", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, PredictiveIntelligenceModule],
    }).compile();

    for (const token of [PI_ORGANIZATION_DIRECTORY, PI_PERSON_DIRECTORY, PI_SUBJECT_DIRECTORY]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
