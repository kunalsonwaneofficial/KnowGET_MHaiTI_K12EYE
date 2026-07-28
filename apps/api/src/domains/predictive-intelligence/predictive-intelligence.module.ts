import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import type { KnowledgeEntityService } from "@knowget/knowledge-graph";
import type { OrganizationService } from "@knowget/organization";
import type { PersonService } from "@knowget/person";
import {
  BacktestService,
  type BacktestRepository,
  type ForecastModelRepository,
  ForecastModelService,
  type ForecastRunRepository,
  ForecastRunService,
  type ObservationSeriesRepository,
  ObservationSeriesService,
  type OrganizationDirectory,
  type PersonDirectory,
  type ScenarioRepository,
  ScenarioService,
  type SeriesSubjectDirectory,
  type SimulationRunRepository,
  SimulationRunService,
  type StrategicPlanRepository,
  StrategicPlanService,
} from "@knowget/predictive-intelligence";
import type { StudentService } from "@knowget/student-lifecycle";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { KnowledgeGraphModule } from "../knowledge-graph/knowledge-graph.module";
import { KG_ENTITY_SERVICE } from "../knowledge-graph/knowledge-graph.tokens";
import { OrganizationModule } from "../organization/organization.module";
import { ORGANIZATION_SERVICE } from "../organization/organization.tokens";
import { PersonModule } from "../person/person.module";
import { PERSON_SERVICE } from "../person/person.tokens";
import { StudentLifecycleModule } from "../student-lifecycle/student-lifecycle.module";
import { STUDENT_SERVICE } from "../student-lifecycle/student-lifecycle.tokens";
import { BacktestController } from "./backtest.controller";
import {
  OrganizationServiceDirectory,
  PersonServiceDirectory,
  PlatformSeriesSubjectDirectory,
} from "./directory.adapters";
import { ForecastModelController } from "./forecast-model.controller";
import { ForecastRunController } from "./forecast-run.controller";
import { ObservationSeriesController } from "./observation-series.controller";
import {
  PI_BACKTEST_REPOSITORY,
  PI_BACKTEST_SERVICE,
  PI_FORECAST_RUN_REPOSITORY,
  PI_FORECAST_RUN_SERVICE,
  PI_MODEL_REPOSITORY,
  PI_MODEL_SERVICE,
  PI_ORGANIZATION_DIRECTORY,
  PI_PERSON_DIRECTORY,
  PI_PLAN_REPOSITORY,
  PI_PLAN_SERVICE,
  PI_SCENARIO_REPOSITORY,
  PI_SCENARIO_SERVICE,
  PI_SERIES_REPOSITORY,
  PI_SERIES_SERVICE,
  PI_SIMULATION_RUN_REPOSITORY,
  PI_SIMULATION_RUN_SERVICE,
  PI_SUBJECT_DIRECTORY,
} from "./predictive-intelligence.tokens";
import { PrismaBacktestRepository } from "./prisma-backtest.repository";
import { PrismaForecastModelRepository } from "./prisma-forecast-model.repository";
import { PrismaForecastRunRepository } from "./prisma-forecast-run.repository";
import { PrismaObservationSeriesRepository } from "./prisma-observation-series.repository";
import { PrismaScenarioRepository } from "./prisma-scenario.repository";
import { PrismaSimulationRunRepository } from "./prisma-simulation-run.repository";
import { PrismaStrategicPlanRepository } from "./prisma-strategic-plan.repository";
import { ScenarioController } from "./scenario.controller";
import { SimulationRunController } from "./simulation-run.controller";
import { StrategicPlanController } from "./strategic-plan.controller";

const repositories: Provider[] = [
  {
    provide: PI_SERIES_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaObservationSeriesRepository(db),
    inject: [DATABASE],
  },
  {
    provide: PI_MODEL_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaForecastModelRepository(db),
    inject: [DATABASE],
  },
  {
    provide: PI_FORECAST_RUN_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaForecastRunRepository(db),
    inject: [DATABASE],
  },
  {
    provide: PI_BACKTEST_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaBacktestRepository(db),
    inject: [DATABASE],
  },
  {
    provide: PI_SCENARIO_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaScenarioRepository(db),
    inject: [DATABASE],
  },
  {
    provide: PI_SIMULATION_RUN_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaSimulationRunRepository(db),
    inject: [DATABASE],
  },
  {
    provide: PI_PLAN_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaStrategicPlanRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: PI_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
  {
    provide: PI_PERSON_DIRECTORY,
    useFactory: (people: PersonService) => new PersonServiceDirectory(people),
    inject: [PERSON_SERVICE],
  },
  {
    provide: PI_SUBJECT_DIRECTORY,
    useFactory: (
      organizations: OrganizationService,
      people: PersonService,
      students: StudentService,
      entities: KnowledgeEntityService,
    ) => new PlatformSeriesSubjectDirectory(organizations, people, students, entities),
    inject: [ORGANIZATION_SERVICE, PERSON_SERVICE, STUDENT_SERVICE, KG_ENTITY_SERVICE],
  },
];

const services: Provider[] = [
  {
    provide: PI_SERIES_SERVICE,
    useFactory: (
      repository: ObservationSeriesRepository,
      organizations: OrganizationDirectory,
      subjects: SeriesSubjectDirectory,
      events: EventBus,
    ) => new ObservationSeriesService({ repository, organizations, subjects, events }),
    inject: [PI_SERIES_REPOSITORY, PI_ORGANIZATION_DIRECTORY, PI_SUBJECT_DIRECTORY, EVENT_BUS],
  },
  {
    provide: PI_MODEL_SERVICE,
    useFactory: (
      repository: ForecastModelRepository,
      backtests: BacktestRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new ForecastModelService({ repository, backtests, organizations, events }),
    inject: [PI_MODEL_REPOSITORY, PI_BACKTEST_REPOSITORY, PI_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: PI_FORECAST_RUN_SERVICE,
    useFactory: (
      repository: ForecastRunRepository,
      series: ObservationSeriesRepository,
      models: ForecastModelRepository,
      people: PersonDirectory,
      events: EventBus,
    ) => new ForecastRunService({ repository, series, models, people, events }),
    inject: [
      PI_FORECAST_RUN_REPOSITORY,
      PI_SERIES_REPOSITORY,
      PI_MODEL_REPOSITORY,
      PI_PERSON_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: PI_BACKTEST_SERVICE,
    useFactory: (
      repository: BacktestRepository,
      series: ObservationSeriesRepository,
      models: ForecastModelRepository,
      people: PersonDirectory,
      events: EventBus,
    ) => new BacktestService({ repository, series, models, people, events }),
    inject: [
      PI_BACKTEST_REPOSITORY,
      PI_SERIES_REPOSITORY,
      PI_MODEL_REPOSITORY,
      PI_PERSON_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: PI_SCENARIO_SERVICE,
    useFactory: (
      repository: ScenarioRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new ScenarioService({ repository, organizations, events }),
    inject: [PI_SCENARIO_REPOSITORY, PI_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: PI_SIMULATION_RUN_SERVICE,
    useFactory: (
      repository: SimulationRunRepository,
      scenarios: ScenarioRepository,
      forecasts: ForecastRunRepository,
      people: PersonDirectory,
      events: EventBus,
    ) => new SimulationRunService({ repository, scenarios, forecasts, people, events }),
    inject: [
      PI_SIMULATION_RUN_REPOSITORY,
      PI_SCENARIO_REPOSITORY,
      PI_FORECAST_RUN_REPOSITORY,
      PI_PERSON_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: PI_PLAN_SERVICE,
    useFactory: (
      repository: StrategicPlanRepository,
      organizations: OrganizationDirectory,
      people: PersonDirectory,
      events: EventBus,
    ) => new StrategicPlanService({ repository, organizations, people, events }),
    inject: [PI_PLAN_REPOSITORY, PI_ORGANIZATION_DIRECTORY, PI_PERSON_DIRECTORY, EVENT_BUS],
  },
];

/**
 * Predictive Intelligence, Simulation & Strategic Planning (P2-D28) — where the platform stops describing what
 * the institution has done and states what it expects to happen. The fourth contract of Program E, and the one
 * twenty-four operational domains deferred their forecasting to rather than each growing a private projector.
 *
 * Follows the domain architecture pattern (ADR-0010): the pure `@knowget/predictive-intelligence` package (seven
 * aggregates over the series, projection, uncertainty, assumption, reproducibility, accuracy, simulation and
 * planning engines) behind repository ports, Prisma/RLS adapters, application services on the platform event bus,
 * and permission-gated, tenant-scoped REST controllers.
 *
 * The contract's rule — every forecast carries confidence intervals, assumptions and uncertainty, and is
 * reproducible and versioned — is enforced by the aggregates rather than by this wiring, but the wiring is what
 * decides who may do each part of it. `forecast:record` gates the evidence a projection stands on, and is
 * separate from everything downstream because a corrected observation retroactively edits the history every
 * published model was fitted against. `forecast:manage` gates the methods and cases an institution permits
 * itself, settled ahead of time by people who answer for them. `forecast:operate` gates the runtime that
 * produces, verifies, supersedes and invalidates runs. `forecast:plan` gates commitment, because setting a target
 * against a projection is a leadership act and not an implication of being able to produce the projection. And
 * `forecast:read` is deliberately wide: a forecast nobody may inspect fails this contract as surely as one
 * carrying no intervals.
 *
 * Three cross-domain reads enter through injected directory ports and never through package imports:
 * organization existence (P2-D01-M01), person existence for every attributed act and every expert-judgement
 * assumption holder (P2-D01-M02), and the subject a series is about — resolved directly for organizations,
 * people and students (P2-D03), and through the knowledge graph (P2-D25) for the twenty-one other domains whose
 * records a series may measure. Exports every service token.
 */
@Module({
  imports: [OrganizationModule, PersonModule, StudentLifecycleModule, KnowledgeGraphModule],
  controllers: [
    ObservationSeriesController,
    ForecastModelController,
    ForecastRunController,
    BacktestController,
    ScenarioController,
    SimulationRunController,
    StrategicPlanController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    PI_SERIES_SERVICE,
    PI_MODEL_SERVICE,
    PI_FORECAST_RUN_SERVICE,
    PI_BACKTEST_SERVICE,
    PI_SCENARIO_SERVICE,
    PI_SIMULATION_RUN_SERVICE,
    PI_PLAN_SERVICE,
  ],
})
export class PredictiveIntelligenceModule {}
