import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  ForecastRunNotFoundError,
  PersonNotFoundForForecastError,
  ScenarioNotFoundError,
  SimulationRunNotFoundError,
} from "./errors";
import { simulationRunProduced, simulationRunSuperseded } from "./forecast-events";
import type { ForecastRun } from "./forecast-run";
import type {
  ForecastRunRepository,
  PersonDirectory,
  ScenarioRepository,
  SimulationRunRepository,
} from "./ports";
import type { Scenario } from "./scenario";
import { type SimulationRun, produceSimulationRun, supersedeSimulationRun } from "./simulation-run";

/** What running a scenario asks for: the case, and the baseline it is a departure from. */
export interface ProduceSimulationRunParams {
  readonly scenarioId: Uuid;
  /** The forecast the scenario is measured against. Must still be the institution's current answer. */
  readonly forecastRunId: Uuid;
  readonly ranByUserId?: Uuid | null;
}

/**
 * Application service for simulation runs — a published scenario measured against a standing forecast.
 *
 * A simulation is a difference, so it is only as meaningful as the two things it is a difference between. Both
 * guards that make it meaningful sit in the aggregate: the scenario must be published, because a draft's levers
 * can still move and a run citing them would misstate its own inputs, and the baseline must be a forecast the
 * institution still stands behind, because a departure from a superseded answer is a departure from nothing.
 * This service's job is to put the two records in front of those guards, and to check that a named runner is a
 * person.
 *
 * Supersession is what keeps the difference honest over time. When the baseline forecast is superseded or
 * invalidated, every simulation standing on it is describing a departure from an answer the institution has
 * withdrawn — {@link SimulationRunService.listStandingOn} is how those are found, and it is the only way to
 * find them, because the run records which forecast it departed from and nothing else records the reverse.
 *
 * There is no re-run in place and no edit. A simulation is an outcome, and a new one supersedes the old rather
 * than overwriting it, so what the institution saw at the time survives what it believes now.
 */
export interface SimulationRunServiceDeps {
  readonly repository: SimulationRunRepository;
  readonly scenarios: ScenarioRepository;
  readonly forecasts: ForecastRunRepository;
  readonly people: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class SimulationRunService {
  private readonly repository: SimulationRunRepository;
  private readonly scenarios: ScenarioRepository;
  private readonly forecasts: ForecastRunRepository;
  private readonly people: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: SimulationRunServiceDeps) {
    this.repository = deps.repository;
    this.scenarios = deps.scenarios;
    this.forecasts = deps.forecasts;
    this.people = deps.people;
    this.events = deps.events;
  }

  // --- Running ---------------------------------------------------------------------

  /**
   * Run one published scenario against one standing forecast, and keep the outcome.
   *
   * Every check runs before anything is written, so a refusal from any of them leaves the store as it was.
   */
  async produce(tenantId: TenantId, params: ProduceSimulationRunParams): Promise<SimulationRun> {
    const scenario = await this.requireScenario(tenantId, params.scenarioId);
    const forecastRun = await this.requireForecastRun(tenantId, params.forecastRunId);
    if (params.ranByUserId) {
      await this.requirePerson(tenantId, params.ranByUserId);
    }

    const run = produceSimulationRun({
      scenario,
      forecastRun,
      ranByUserId: params.ranByUserId ?? null,
    });

    await this.repository.save(run);
    await this.emit(simulationRunProduced(run));
    return run;
  }

  /** A newer run replaced this one. Whoever is still citing it should read the replacement instead. */
  async supersede(tenantId: TenantId, id: Uuid, replacementRunId: Uuid): Promise<SimulationRun> {
    await this.require(tenantId, replacementRunId);
    return this.transition(
      tenantId,
      id,
      supersedeSimulationRun,
      simulationRunSuperseded,
      replacementRunId,
    );
  }

  // --- Reading ---------------------------------------------------------------------

  /** One run, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<SimulationRun> {
    return this.require(tenantId, id);
  }

  /** The institution's current outcome for a scenario, if it has one. */
  async findCurrentForScenario(
    tenantId: TenantId,
    scenarioId: Uuid,
  ): Promise<SimulationRun | null> {
    return this.repository.findLatestForScenario(tenantId, scenarioId);
  }

  /** Every run of a scenario. How its answer moved as the baseline under it moved. */
  async listByScenario(tenantId: TenantId, scenarioId: Uuid): Promise<readonly SimulationRun[]> {
    return this.repository.listByScenario(tenantId, scenarioId);
  }

  /**
   * Every simulation that departed from one forecast.
   *
   * What superseding or invalidating that forecast puts in question, and the only way to ask it.
   */
  async listStandingOn(tenantId: TenantId, forecastRunId: Uuid): Promise<readonly SimulationRun[]> {
    return this.repository.listByForecastRun(tenantId, forecastRunId);
  }

  /** Every simulation run in the tenant. */
  async list(tenantId: TenantId): Promise<readonly SimulationRun[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The run under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<SimulationRun> {
    const run = await this.repository.findById(tenantId, id);
    if (!run) {
      throw new SimulationRunNotFoundError(id);
    }
    return run;
  }

  /** The case being run, or a 404 naming it. Publication is the aggregate's check, not this one's. */
  private async requireScenario(tenantId: TenantId, id: Uuid): Promise<Scenario> {
    const scenario = await this.scenarios.findById(tenantId, id);
    if (!scenario) {
      throw new ScenarioNotFoundError(id);
    }
    return scenario;
  }

  /** The baseline, or a 404 naming it. Whether it still stands is the aggregate's check. */
  private async requireForecastRun(tenantId: TenantId, id: Uuid): Promise<ForecastRun> {
    const run = await this.forecasts.findById(tenantId, id);
    if (!run) {
      throw new ForecastRunNotFoundError(id);
    }
    return run;
  }

  /** The person who ran it, checked against the directory. */
  private async requirePerson(tenantId: TenantId, personId: Uuid): Promise<void> {
    if (!(await this.people.exists(tenantId, personId))) {
      throw new PersonNotFoundForForecastError(personId, "person who ran the simulation");
    }
  }

  /** Load, apply a guarded pure transition, save, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (run: SimulationRun, ...args: TArgs) => SimulationRun,
    announce: (run: SimulationRun) => DomainEvent,
    ...args: TArgs
  ): Promise<SimulationRun> {
    const next = move(await this.require(tenantId, id), ...args);
    await this.repository.save(next);
    await this.emit(announce(next));
    return next;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
