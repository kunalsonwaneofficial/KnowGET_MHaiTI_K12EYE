import type { TenantId, Uuid } from "@knowget/types";
import type { Backtest } from "./backtest";
import type { ForecastModel } from "./forecast-model";
import type { ForecastRun } from "./forecast-run";
import type { ObservationSeries } from "./observation-series";
import type { Scenario } from "./scenario";
import type { SimulationRun } from "./simulation-run";
import type { StrategicPlan } from "./strategic-plan";

/**
 * The storage and directory contracts predictive intelligence depends on, and nothing more.
 *
 * Every method takes the tenant explicitly and every read filters on it, on top of the row-level security the
 * adapters run under. Two independent barriers is the platform's standing position: RLS is the one that cannot
 * be forgotten, and the explicit argument is the one that shows up in a code review.
 *
 * Nothing here reaches beyond this domain's own records except the three directories, which are read models
 * rather than dependencies — this domain never imports another domain package.
 *
 * Only a model and a scenario can be removed, and only while they are drafts. Everything else here is a claim
 * that was made about the future at a moment somebody can name, and the contract's fourth rule — that a
 * forecast is reproducible — is worth nothing if the record of what was projected can be quietly taken away
 * when it turns out badly. A series is the measured history; a run, a backtest, a simulation and a plan are
 * what was projected, scored, explored and committed to. Each has a way out that leaves the history intact —
 * withdrawn, closed, superseded, invalidated, archived, abandoned — which is what a `remove` would otherwise
 * be reached for.
 */

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node exist in the tenant? Every
 * series, model, run, backtest, scenario, simulation and plan hangs off one.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Read model over the identity domain (P2-D01-M02): is this person somebody in the tenant?
 *
 * Everything this domain records about a person is an accountability, not a convenience. Who produced a run,
 * who ran a backtest, who activated a plan, who reviewed it and who abandoned it are the names attached to a
 * claim about the future — and an assumption whose basis is `expert_judgement` is a named person's judgement
 * or it is nobody's. The contract's second rule is that assumptions are declared; declaring one against a
 * holder who does not exist satisfies the letter of that and none of its point.
 */
export interface PersonDirectory {
  exists(tenantId: TenantId, personId: Uuid): Promise<boolean>;
}

/**
 * Read model over whatever a series is about: does this subject exist in the domain that owns it?
 *
 * A series carries a `sourceDomain` and an optional `subjectRef` — attendance for one grade, cash flow for one
 * cost centre, demand on one transport route. When a series names a subject, a forecast about a subject that
 * is not there is a forecast about nothing, and it will be discovered by whoever is asked to act on it rather
 * than by whoever declared it. Series with no `subjectRef` are institution-wide and skip this check.
 */
export interface SeriesSubjectDirectory {
  exists(tenantId: TenantId, sourceDomain: string, subjectRef: string): Promise<boolean>;
}

/**
 * Storage contract for observation series. Tenant-scoped (explicit argument + RLS).
 *
 * `findByKey` is what enforces one series per key per organization, because two series claiming to measure the
 * same thing is how a forecast comes to depend on whichever one the caller happened to find. `listByMetric` is
 * the read behind everything that reasons across a metric rather than a single grade or route — a plan
 * objective naming `attendance.rate` needs the series measuring it, and there may be one per grade.
 * `listBySubject` is the other direction: everything this platform projects about one student, one route, one
 * cost centre. A series is never removed; it is the measured history, and withdrawal and closing exist so that
 * correcting it stays visible.
 */
export interface ObservationSeriesRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<ObservationSeries | null>;
  findByKey(
    tenantId: TenantId,
    organizationId: Uuid,
    seriesKey: string,
  ): Promise<ObservationSeries | null>;
  listByMetric(tenantId: TenantId, metricKey: string): Promise<ObservationSeries[]>;
  listBySubject(
    tenantId: TenantId,
    sourceDomain: string,
    subjectRef: string,
  ): Promise<ObservationSeries[]>;
  listByTenant(tenantId: TenantId): Promise<ObservationSeries[]>;
  save(series: ObservationSeries): Promise<void>;
}

/** In-memory {@link ObservationSeriesRepository} — the default for tests and bootstrap. */
export class InMemoryObservationSeriesRepository implements ObservationSeriesRepository {
  private readonly byId = new Map<string, ObservationSeries>();

  async findById(tenantId: TenantId, id: Uuid): Promise<ObservationSeries | null> {
    const series = this.byId.get(id);
    return series && series.tenantId === tenantId ? series : null;
  }

  async findByKey(
    tenantId: TenantId,
    organizationId: Uuid,
    seriesKey: string,
  ): Promise<ObservationSeries | null> {
    return (
      [...this.byId.values()].find(
        (s) =>
          s.tenantId === tenantId &&
          s.organizationId === organizationId &&
          s.seriesKey === seriesKey,
      ) ?? null
    );
  }

  async listByMetric(tenantId: TenantId, metricKey: string): Promise<ObservationSeries[]> {
    return [...this.byId.values()].filter(
      (s) => s.tenantId === tenantId && s.metricKey === metricKey,
    );
  }

  async listBySubject(
    tenantId: TenantId,
    sourceDomain: string,
    subjectRef: string,
  ): Promise<ObservationSeries[]> {
    return [...this.byId.values()].filter(
      (s) =>
        s.tenantId === tenantId && s.sourceDomain === sourceDomain && s.subjectRef === subjectRef,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<ObservationSeries[]> {
    return [...this.byId.values()].filter((s) => s.tenantId === tenantId);
  }

  async save(series: ObservationSeries): Promise<void> {
    this.byId.set(series.id, series);
  }
}

/**
 * Storage contract for forecast models. Tenant-scoped (explicit argument + RLS).
 *
 * A key does not identify a model here — a key and a version do, because revising a published model creates a
 * new draft beside it rather than editing the one runs are pinned to. A run records `modelVersion` and a digest
 * computed from it, so editing a published model in place would make every run that cited it a claim about a
 * model that no longer exists. So there are three ways in and each answers a different question.
 * `findByKeyAndVersion` is what enforces one row per version. `findPublishedByKey` is what a run asks: which
 * version may be pinned right now. `listVersionsOfKey` is what the version guard reads before publishing.
 * A model can be removed while it is a draft — nothing cites a draft.
 */
export interface ForecastModelRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<ForecastModel | null>;
  findByKeyAndVersion(
    tenantId: TenantId,
    modelKey: string,
    version: number,
  ): Promise<ForecastModel | null>;
  findPublishedByKey(tenantId: TenantId, modelKey: string): Promise<ForecastModel | null>;
  listVersionsOfKey(tenantId: TenantId, modelKey: string): Promise<ForecastModel[]>;
  listPublished(tenantId: TenantId): Promise<ForecastModel[]>;
  listByTenant(tenantId: TenantId): Promise<ForecastModel[]>;
  save(model: ForecastModel): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link ForecastModelRepository} — the default for tests and bootstrap. */
export class InMemoryForecastModelRepository implements ForecastModelRepository {
  private readonly byId = new Map<string, ForecastModel>();

  async findById(tenantId: TenantId, id: Uuid): Promise<ForecastModel | null> {
    const model = this.byId.get(id);
    return model && model.tenantId === tenantId ? model : null;
  }

  async findByKeyAndVersion(
    tenantId: TenantId,
    modelKey: string,
    version: number,
  ): Promise<ForecastModel | null> {
    return (
      [...this.byId.values()].find(
        (m) => m.tenantId === tenantId && m.modelKey === modelKey && m.version === version,
      ) ?? null
    );
  }

  async findPublishedByKey(tenantId: TenantId, modelKey: string): Promise<ForecastModel | null> {
    return (
      [...this.byId.values()].find(
        (m) => m.tenantId === tenantId && m.modelKey === modelKey && m.status === "published",
      ) ?? null
    );
  }

  async listVersionsOfKey(tenantId: TenantId, modelKey: string): Promise<ForecastModel[]> {
    return [...this.byId.values()].filter(
      (m) => m.tenantId === tenantId && m.modelKey === modelKey,
    );
  }

  async listPublished(tenantId: TenantId): Promise<ForecastModel[]> {
    return [...this.byId.values()].filter(
      (m) => m.tenantId === tenantId && m.status === "published",
    );
  }

  async listByTenant(tenantId: TenantId): Promise<ForecastModel[]> {
    return [...this.byId.values()].filter((m) => m.tenantId === tenantId);
  }

  async save(model: ForecastModel): Promise<void> {
    this.byId.set(model.id, model);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const model = this.byId.get(id);
    if (model && model.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/**
 * Storage contract for forecast runs. Tenant-scoped (explicit argument + RLS).
 *
 * `findByDigest` is the read the contract's fourth rule turns on. A digest is computed from the pinned inputs
 * alone, so two runs sharing one are the same computation done twice — which is worth knowing before the
 * second is stored, and is the only way an auditor can ask "has this exact forecast been produced before"
 * without reproducing it. `findLatestForSeries` is the current forecast for a series, which is what everything
 * downstream of this domain actually wants. `listBySeries` and `listByModel` are the two sweeps behind
 * re-verification: a corrected series and a retired model each put a set of runs in question. Runs are never
 * removed — superseding and invalidating are how a run stops being current while staying on the record.
 */
export interface ForecastRunRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<ForecastRun | null>;
  findByDigest(tenantId: TenantId, digest: string): Promise<ForecastRun | null>;
  findLatestForSeries(tenantId: TenantId, seriesId: Uuid): Promise<ForecastRun | null>;
  listBySeries(tenantId: TenantId, seriesId: Uuid): Promise<ForecastRun[]>;
  listByModel(tenantId: TenantId, modelId: Uuid): Promise<ForecastRun[]>;
  listByTenant(tenantId: TenantId): Promise<ForecastRun[]>;
  save(run: ForecastRun): Promise<void>;
}

/** In-memory {@link ForecastRunRepository} — the default for tests and bootstrap. */
export class InMemoryForecastRunRepository implements ForecastRunRepository {
  private readonly byId = new Map<string, ForecastRun>();

  async findById(tenantId: TenantId, id: Uuid): Promise<ForecastRun | null> {
    const run = this.byId.get(id);
    return run && run.tenantId === tenantId ? run : null;
  }

  async findByDigest(tenantId: TenantId, digest: string): Promise<ForecastRun | null> {
    return (
      [...this.byId.values()].find((r) => r.tenantId === tenantId && r.digest === digest) ?? null
    );
  }

  async findLatestForSeries(tenantId: TenantId, seriesId: Uuid): Promise<ForecastRun | null> {
    return [...this.byId.values()]
      .filter((r) => r.tenantId === tenantId && r.seriesId === seriesId && r.status === "completed")
      .reduce<ForecastRun | null>(
        (latest, r) => (latest === null || r.producedAt >= latest.producedAt ? r : latest),
        null,
      );
  }

  async listBySeries(tenantId: TenantId, seriesId: Uuid): Promise<ForecastRun[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.seriesId === seriesId,
    );
  }

  async listByModel(tenantId: TenantId, modelId: Uuid): Promise<ForecastRun[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId && r.modelId === modelId);
  }

  async listByTenant(tenantId: TenantId): Promise<ForecastRun[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(run: ForecastRun): Promise<void> {
    this.byId.set(run.id, run);
  }
}

/**
 * Storage contract for backtests. Tenant-scoped (explicit argument + RLS).
 *
 * `findLatestForPair` is the read that gates publication: a model is published against the series it was
 * scored on, and the score has to be found before the publication can be judged. `listByModel` is the record
 * a reviewer reads — the same model scored on several series, or scored again after the history moved.
 * Backtests are never removed. A score that was earned is a fact about a model at a moment, and a model whose
 * bad scores can be deleted is a model whose good scores mean nothing.
 */
export interface BacktestRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Backtest | null>;
  findLatestForPair(tenantId: TenantId, seriesId: Uuid, modelId: Uuid): Promise<Backtest | null>;
  listByModel(tenantId: TenantId, modelId: Uuid): Promise<Backtest[]>;
  listBySeries(tenantId: TenantId, seriesId: Uuid): Promise<Backtest[]>;
  listByTenant(tenantId: TenantId): Promise<Backtest[]>;
  save(backtest: Backtest): Promise<void>;
}

/** In-memory {@link BacktestRepository} — the default for tests and bootstrap. */
export class InMemoryBacktestRepository implements BacktestRepository {
  private readonly byId = new Map<string, Backtest>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Backtest | null> {
    const backtest = this.byId.get(id);
    return backtest && backtest.tenantId === tenantId ? backtest : null;
  }

  async findLatestForPair(
    tenantId: TenantId,
    seriesId: Uuid,
    modelId: Uuid,
  ): Promise<Backtest | null> {
    return [...this.byId.values()]
      .filter((b) => b.tenantId === tenantId && b.seriesId === seriesId && b.modelId === modelId)
      .reduce<Backtest | null>(
        (latest, b) => (latest === null || b.ranAt >= latest.ranAt ? b : latest),
        null,
      );
  }

  async listByModel(tenantId: TenantId, modelId: Uuid): Promise<Backtest[]> {
    return [...this.byId.values()].filter((b) => b.tenantId === tenantId && b.modelId === modelId);
  }

  async listBySeries(tenantId: TenantId, seriesId: Uuid): Promise<Backtest[]> {
    return [...this.byId.values()].filter(
      (b) => b.tenantId === tenantId && b.seriesId === seriesId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Backtest[]> {
    return [...this.byId.values()].filter((b) => b.tenantId === tenantId);
  }

  async save(backtest: Backtest): Promise<void> {
    this.byId.set(backtest.id, backtest);
  }
}

/**
 * Storage contract for scenarios. Tenant-scoped (explicit argument + RLS).
 *
 * A scenario is identified by its key alone, unlike a model: revising a published scenario declares a new one
 * under a new key rather than a new version under the same one, because "the austerity case" and "the
 * austerity case as revised in March" are two things a board compares rather than two versions of one thing.
 * `findByKey` is what the key guard reads. `listPublished` is what a simulation may pin. A draft scenario can
 * be removed — nothing has been simulated against it yet.
 */
export interface ScenarioRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Scenario | null>;
  findByKey(
    tenantId: TenantId,
    organizationId: Uuid,
    scenarioKey: string,
  ): Promise<Scenario | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Scenario[]>;
  listPublished(tenantId: TenantId): Promise<Scenario[]>;
  listByTenant(tenantId: TenantId): Promise<Scenario[]>;
  save(scenario: Scenario): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link ScenarioRepository} — the default for tests and bootstrap. */
export class InMemoryScenarioRepository implements ScenarioRepository {
  private readonly byId = new Map<string, Scenario>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Scenario | null> {
    const scenario = this.byId.get(id);
    return scenario && scenario.tenantId === tenantId ? scenario : null;
  }

  async findByKey(
    tenantId: TenantId,
    organizationId: Uuid,
    scenarioKey: string,
  ): Promise<Scenario | null> {
    return (
      [...this.byId.values()].find(
        (s) =>
          s.tenantId === tenantId &&
          s.organizationId === organizationId &&
          s.scenarioKey === scenarioKey,
      ) ?? null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Scenario[]> {
    return [...this.byId.values()].filter(
      (s) => s.tenantId === tenantId && s.organizationId === organizationId,
    );
  }

  async listPublished(tenantId: TenantId): Promise<Scenario[]> {
    return [...this.byId.values()].filter(
      (s) => s.tenantId === tenantId && s.status === "published",
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Scenario[]> {
    return [...this.byId.values()].filter((s) => s.tenantId === tenantId);
  }

  async save(scenario: Scenario): Promise<void> {
    this.byId.set(scenario.id, scenario);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const scenario = this.byId.get(id);
    if (scenario && scenario.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/**
 * Storage contract for simulation runs. Tenant-scoped (explicit argument + RLS).
 *
 * `listByForecastRun` is the read that keeps a scenario comparison honest. A simulation is a baseline forecast
 * with levers applied, so it inherits everything wrong with that baseline: when the baseline is superseded or
 * invalidated, every simulation standing on it is a comparison against a forecast nobody believes any more,
 * and the only way to find them is to ask which ones pinned it. `findLatestForScenario` is the current
 * exploration of a scenario. Simulations are never removed, for the same reason runs are not.
 */
export interface SimulationRunRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<SimulationRun | null>;
  findLatestForScenario(tenantId: TenantId, scenarioId: Uuid): Promise<SimulationRun | null>;
  listByScenario(tenantId: TenantId, scenarioId: Uuid): Promise<SimulationRun[]>;
  listByForecastRun(tenantId: TenantId, forecastRunId: Uuid): Promise<SimulationRun[]>;
  listByTenant(tenantId: TenantId): Promise<SimulationRun[]>;
  save(run: SimulationRun): Promise<void>;
}

/** In-memory {@link SimulationRunRepository} — the default for tests and bootstrap. */
export class InMemorySimulationRunRepository implements SimulationRunRepository {
  private readonly byId = new Map<string, SimulationRun>();

  async findById(tenantId: TenantId, id: Uuid): Promise<SimulationRun | null> {
    const run = this.byId.get(id);
    return run && run.tenantId === tenantId ? run : null;
  }

  async findLatestForScenario(tenantId: TenantId, scenarioId: Uuid): Promise<SimulationRun | null> {
    return [...this.byId.values()]
      .filter(
        (r) => r.tenantId === tenantId && r.scenarioId === scenarioId && r.status === "completed",
      )
      .reduce<SimulationRun | null>(
        (latest, r) => (latest === null || r.ranAt >= latest.ranAt ? r : latest),
        null,
      );
  }

  async listByScenario(tenantId: TenantId, scenarioId: Uuid): Promise<SimulationRun[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.scenarioId === scenarioId,
    );
  }

  async listByForecastRun(tenantId: TenantId, forecastRunId: Uuid): Promise<SimulationRun[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.forecastRunId === forecastRunId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<SimulationRun[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(run: SimulationRun): Promise<void> {
    this.byId.set(run.id, run);
  }
}

/**
 * Storage contract for strategic plans. Tenant-scoped (explicit argument + RLS).
 *
 * `listByMetric` is the read that connects a plan back to the measurement underneath it. An objective names a
 * metric key; when the series measuring that metric takes a correction, every active plan tracking against it
 * is reviewing itself on figures that have since moved, and the only way to find those plans is to ask which
 * ones named the metric. `listActive` is the review sweep. Plans are never removed: a plan that was abandoned
 * is the institution's record that it was tried, and deleting it turns a change of course into an omission.
 */
export interface StrategicPlanRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<StrategicPlan | null>;
  findByKey(
    tenantId: TenantId,
    organizationId: Uuid,
    planKey: string,
  ): Promise<StrategicPlan | null>;
  listActive(tenantId: TenantId): Promise<StrategicPlan[]>;
  listByMetric(tenantId: TenantId, metricKey: string): Promise<StrategicPlan[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<StrategicPlan[]>;
  listByTenant(tenantId: TenantId): Promise<StrategicPlan[]>;
  save(plan: StrategicPlan): Promise<void>;
}

/** In-memory {@link StrategicPlanRepository} — the default for tests and bootstrap. */
export class InMemoryStrategicPlanRepository implements StrategicPlanRepository {
  private readonly byId = new Map<string, StrategicPlan>();

  async findById(tenantId: TenantId, id: Uuid): Promise<StrategicPlan | null> {
    const plan = this.byId.get(id);
    return plan && plan.tenantId === tenantId ? plan : null;
  }

  async findByKey(
    tenantId: TenantId,
    organizationId: Uuid,
    planKey: string,
  ): Promise<StrategicPlan | null> {
    return (
      [...this.byId.values()].find(
        (p) =>
          p.tenantId === tenantId && p.organizationId === organizationId && p.planKey === planKey,
      ) ?? null
    );
  }

  async listActive(tenantId: TenantId): Promise<StrategicPlan[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId && p.status === "active");
  }

  async listByMetric(tenantId: TenantId, metricKey: string): Promise<StrategicPlan[]> {
    return [...this.byId.values()].filter(
      (p) =>
        p.tenantId === tenantId &&
        p.objectives.some((objective) => objective.metricKey === metricKey),
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<StrategicPlan[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<StrategicPlan[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(plan: StrategicPlan): Promise<void> {
    this.byId.set(plan.id, plan);
  }
}
