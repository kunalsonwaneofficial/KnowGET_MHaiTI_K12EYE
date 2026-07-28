import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { type Backtest, requireEarnedPublication } from "./backtest";
import {
  BacktestNotFoundError,
  ForecastModelNotFoundError,
  OrganizationNotFoundForForecastError,
  PublishedModelImmutableError,
} from "./errors";
import { modelAmended, modelDrafted, modelPublished, modelRetired } from "./forecast-events";
import {
  type ForecastModel,
  type ForecastModelAmendment,
  type ForecastModelParams,
  amendModel,
  draftForecastModel,
  guardVersionAvailable,
  nextModelVersion,
  publishModel,
  retireModel,
  reviseModel,
} from "./forecast-model";
import type { BacktestRepository, ForecastModelRepository, OrganizationDirectory } from "./ports";

/** What publishing a model requires: the evidence, and optionally the number to publish it under. */
export interface PublishForecastModelParams {
  /**
   * The backtest that earns it. Publication cites its evidence rather than asserting it, which is what makes
   * "this model was published on the strength of X" a question with an answer six months later.
   */
  readonly backtestId: Uuid;
  /** Defaults to the next free version under this key. */
  readonly version?: number;
}

/**
 * Application service for forecast models — the methods an institution stands behind, versioned.
 *
 * The join that matters is publication. The aggregate can say a model is a coherent method with valid
 * parameters; it cannot say the method actually works, because that is a fact about how it scored against
 * history it had not seen, and history lives in another aggregate. So `publish` will not proceed without a
 * backtest, and not on any backtest — on one that scored *this* model and that earned publication under
 * {@link requireEarnedPublication}. A model that beat nothing and whose intervals caught materially fewer
 * outcomes than they claimed cannot be published here at all, which is the difference between a platform that
 * checks calibration and one that reports it.
 *
 * The evidence is named by the caller rather than searched for, and the lookup is scoped to the model. Letting
 * the service hunt for *some* passing backtest would let an author re-run until one passed and publish on the
 * lucky score; naming it puts the choice on the record next to the person who made it.
 *
 * Version uniqueness lives here for the ordinary reason — an aggregate cannot see its siblings. Only published
 * and retired rows hold a version: a draft sits at `0` until publication mints its number, so two drafts under
 * one key never collide with each other or with anything a run has pinned.
 */
export interface ForecastModelServiceDeps {
  readonly repository: ForecastModelRepository;
  readonly backtests: BacktestRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class ForecastModelService {
  private readonly repository: ForecastModelRepository;
  private readonly backtests: BacktestRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ForecastModelServiceDeps) {
    this.repository = deps.repository;
    this.backtests = deps.backtests;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  // --- Authoring -------------------------------------------------------------------

  /** Draft a method. Nothing may pin a draft, because a draft is not frozen and so could not be reproduced. */
  async draft(input: ForecastModelParams): Promise<ForecastModel> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForForecastError(input.organizationId);
    }

    const model = draftForecastModel(input);
    await this.repository.save(model);
    await this.emit(modelDrafted(model));
    return model;
  }

  /** Change what a draft says. Refused once published — a published method is what runs pinned. */
  async amend(
    tenantId: TenantId,
    id: Uuid,
    amendment: ForecastModelAmendment,
  ): Promise<ForecastModel> {
    return this.transition(tenantId, id, amendModel, modelAmended, amendment);
  }

  /**
   * Revise a published version into a fresh draft under the same key. The published one is untouched, and so
   * is every run that pinned it.
   */
  async revise(
    tenantId: TenantId,
    id: Uuid,
    amendment: ForecastModelAmendment = {},
  ): Promise<ForecastModel> {
    const revision = reviseModel(await this.require(tenantId, id), amendment);
    await this.repository.save(revision);
    await this.emit(modelDrafted(revision));
    return revision;
  }

  // --- Lifecycle -------------------------------------------------------------------

  /**
   * Publish a draft under a version, on the strength of a backtest that earned it.
   *
   * The evidence is checked before the version is resolved, so a model that has not earned publication is
   * refused without consuming a number — the next honest attempt gets the one it would have had.
   */
  async publish(
    tenantId: TenantId,
    id: Uuid,
    params: PublishForecastModelParams,
  ): Promise<ForecastModel> {
    const model = await this.require(tenantId, id);
    requireEarnedPublication(await this.requireEvidence(tenantId, model, params.backtestId));

    const taken = await this.pinnedVersions(tenantId, model.modelKey);
    const version = params.version ?? nextModelVersion(taken);
    guardVersionAvailable(model.modelKey, version, taken);

    return this.transition(tenantId, id, publishModel, modelPublished, version);
  }

  /** Retire a version. No new run may pin it; every run that already did stays as reproducible as it was. */
  async retire(tenantId: TenantId, id: Uuid): Promise<ForecastModel> {
    return this.transition(tenantId, id, retireModel, modelRetired);
  }

  /**
   * Delete a draft that was never published.
   *
   * The only removal this aggregate has, and it is bounded to drafts on purpose. A published version is what
   * runs recorded themselves against; deleting it would leave those runs pinning a method nobody can read.
   */
  async discard(tenantId: TenantId, id: Uuid): Promise<void> {
    const model = await this.require(tenantId, id);
    if (model.status !== "draft") {
      throw new PublishedModelImmutableError(model.id, model.status);
    }
    await this.repository.remove(tenantId, id);
  }

  // --- Reading ---------------------------------------------------------------------

  /** One version, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<ForecastModel> {
    return this.require(tenantId, id);
  }

  /** The version a new run would pin under this key, if there is one. */
  async findPublished(tenantId: TenantId, modelKey: string): Promise<ForecastModel | null> {
    return this.repository.findPublishedByKey(tenantId, modelKey);
  }

  /** One exact version under a key — how a run's pinned reference is resolved back to the method it used. */
  async findVersion(
    tenantId: TenantId,
    modelKey: string,
    version: number,
  ): Promise<ForecastModel | null> {
    return this.repository.findByKeyAndVersion(tenantId, modelKey, version);
  }

  /** Every row under one key, drafts included. The lineage. */
  async listVersions(tenantId: TenantId, modelKey: string): Promise<readonly ForecastModel[]> {
    return this.repository.listVersionsOfKey(tenantId, modelKey);
  }

  /** Every method a run may currently pin. */
  async listPublished(tenantId: TenantId): Promise<readonly ForecastModel[]> {
    return this.repository.listPublished(tenantId);
  }

  /** Every model in the tenant. */
  async list(tenantId: TenantId): Promise<readonly ForecastModel[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The model under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<ForecastModel> {
    const model = await this.repository.findById(tenantId, id);
    if (!model) {
      throw new ForecastModelNotFoundError(id);
    }
    return model;
  }

  /**
   * The named backtest, scoped to this model.
   *
   * A backtest of some other model is reported as not found rather than as a mismatch, because from this
   * model's point of view that is exactly what it is: there is no such evidence about *it*.
   */
  private async requireEvidence(
    tenantId: TenantId,
    model: ForecastModel,
    backtestId: Uuid,
  ): Promise<Backtest> {
    const scored = await this.backtests.listByModel(tenantId, model.id);
    const evidence = scored.find((backtest) => backtest.id === backtestId);
    if (!evidence) {
      throw new BacktestNotFoundError(backtestId);
    }
    return evidence;
  }

  /**
   * The versions already spoken for under a key.
   *
   * Drafts are excluded because a draft has no version yet — it sits at `0` until publication mints one — so
   * counting them would make the second draft under a key collide with the first over a number neither holds.
   */
  private async pinnedVersions(tenantId: TenantId, modelKey: string): Promise<readonly number[]> {
    const siblings = await this.repository.listVersionsOfKey(tenantId, modelKey);
    return siblings.filter((model) => model.status !== "draft").map((model) => model.version);
  }

  /** Load, apply a guarded pure transition, save, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (model: ForecastModel, ...args: TArgs) => ForecastModel,
    announce: (model: ForecastModel) => DomainEvent,
    ...args: TArgs
  ): Promise<ForecastModel> {
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
