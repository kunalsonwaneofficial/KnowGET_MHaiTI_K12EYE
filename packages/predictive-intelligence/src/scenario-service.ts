import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateScenarioKeyError,
  OrganizationNotFoundForForecastError,
  PublishedScenarioImmutableError,
  ScenarioNotFoundError,
} from "./errors";
import {
  scenarioAmended,
  scenarioArchived,
  scenarioDeclared,
  scenarioLeversChanged,
  scenarioPublished,
} from "./forecast-events";
import type { OrganizationDirectory, ScenarioRepository } from "./ports";
import {
  type LeverAmendment,
  type LeverInput,
  type Scenario,
  type ScenarioAmendment,
  type ScenarioParams,
  addLevers,
  amendLever,
  amendScenario,
  archiveScenario,
  declareScenario,
  publishScenario,
  removeLever,
  reviseScenario,
} from "./scenario";

/**
 * Application service for scenarios — the "what if" an institution is prepared to put its name to.
 *
 * Two things live here rather than in the aggregate, and both are about a scenario's siblings.
 *
 * A scenario key is unique within an organization, and the clash is checked on the normalized key the aggregate
 * produced rather than on the string the caller sent, so `Austerity Case ` and `austerity.case` cannot both be
 * declared. That check runs on the revision path too, because revising is declaring: {@link reviseScenario}
 * opens a new draft under a *new* key rather than a new version under the old one, and a revision whose key is
 * already taken is the same collision arriving by a different route.
 *
 * The organization is checked at declaration, once, at the moment the reference is asserted.
 *
 * Publication is the boundary everything else respects. Before it, a scenario is a draft whose levers can still
 * move; after it, the lever set is frozen, because a simulation cites a scenario version and a lever that moved
 * underneath it would make that citation a lie. So the mutating operations are refused on a published scenario
 * by the aggregate, and the one removal this service has is bounded to drafts: an archived scenario is the
 * institution's record that a case was considered and set aside, and deleting it turns that into an omission.
 */
export interface ScenarioServiceDeps {
  readonly repository: ScenarioRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class ScenarioService {
  private readonly repository: ScenarioRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ScenarioServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  // --- Authoring -------------------------------------------------------------------

  /**
   * Declare a scenario as an editable draft.
   *
   * The organization and the key are both checked before anything is written, so a refusal from either leaves
   * the store exactly as it was.
   */
  async declare(input: ScenarioParams): Promise<Scenario> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForForecastError(input.organizationId);
    }

    const scenario = declareScenario(input);
    await this.guardKeyAvailable(scenario);

    await this.repository.save(scenario);
    await this.emit(scenarioDeclared(scenario));
    return scenario;
  }

  /** Restate what a draft says about itself. The levers have their own operations. */
  async amend(tenantId: TenantId, id: Uuid, amendment: ScenarioAmendment): Promise<Scenario> {
    return this.transition(tenantId, id, amendScenario, scenarioAmended, amendment);
  }

  /**
   * Open a new draft from a published or archived scenario, carrying its levers forward under a new key.
   *
   * The original is untouched, and so is every simulation that cited it. The new key is required rather than
   * derived, because naming the revision is the decision being made.
   */
  async revise(
    tenantId: TenantId,
    id: Uuid,
    scenarioKey: string,
    amendment: ScenarioAmendment = {},
  ): Promise<Scenario> {
    const revision = reviseScenario(await this.require(tenantId, id), scenarioKey, amendment);
    await this.guardKeyAvailable(revision);

    await this.repository.save(revision);
    await this.emit(scenarioDeclared(revision));
    return revision;
  }

  // --- Levers ----------------------------------------------------------------------

  /** Add levers to a draft. Announced as a change to the set rather than as an amendment to the scenario. */
  async addLevers(tenantId: TenantId, id: Uuid, levers: readonly LeverInput[]): Promise<Scenario> {
    return this.transition(tenantId, id, addLevers, scenarioLeversChanged, levers);
  }

  /** Restate one lever of a draft. Its key is its identity and is not amendable. */
  async amendLever(
    tenantId: TenantId,
    id: Uuid,
    leverKey: string,
    amendment: LeverAmendment,
  ): Promise<Scenario> {
    return this.transition(tenantId, id, amendLever, scenarioLeversChanged, leverKey, amendment);
  }

  /** Take a lever out of a draft. */
  async removeLever(tenantId: TenantId, id: Uuid, leverKey: string): Promise<Scenario> {
    return this.transition(tenantId, id, removeLever, scenarioLeversChanged, leverKey);
  }

  // --- Lifecycle -------------------------------------------------------------------

  /** Freeze the lever set. A scenario that moves nothing is refused — there would be no "what if" in it. */
  async publish(tenantId: TenantId, id: Uuid): Promise<Scenario> {
    return this.transition(tenantId, id, publishScenario, scenarioPublished);
  }

  /** Set a case aside. No new simulation may pin it; every simulation that already did stays readable. */
  async archive(tenantId: TenantId, id: Uuid): Promise<Scenario> {
    return this.transition(tenantId, id, archiveScenario, scenarioArchived);
  }

  /**
   * Delete a draft that was never published.
   *
   * Bounded to drafts on purpose. Nothing has been simulated against a draft, so nothing loses its grounds when
   * one goes; a published scenario is what simulation runs recorded themselves against.
   */
  async discard(tenantId: TenantId, id: Uuid): Promise<void> {
    const scenario = await this.require(tenantId, id);
    if (scenario.status !== "draft") {
      throw new PublishedScenarioImmutableError(scenario.id, scenario.status);
    }
    await this.repository.remove(tenantId, id);
  }

  // --- Reading ---------------------------------------------------------------------

  /** One scenario, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<Scenario> {
    return this.require(tenantId, id);
  }

  /** The scenario an organization keeps under this key, if it keeps one. */
  async findByKey(
    tenantId: TenantId,
    organizationId: Uuid,
    scenarioKey: string,
  ): Promise<Scenario | null> {
    return this.repository.findByKey(tenantId, organizationId, scenarioKey);
  }

  /** Every scenario an organization has authored, at any status. */
  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<readonly Scenario[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  /** Every scenario a simulation may currently pin. */
  async listPublished(tenantId: TenantId): Promise<readonly Scenario[]> {
    return this.repository.listPublished(tenantId);
  }

  /** Every scenario in the tenant. */
  async list(tenantId: TenantId): Promise<readonly Scenario[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The scenario under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<Scenario> {
    const scenario = await this.repository.findById(tenantId, id);
    if (!scenario) {
      throw new ScenarioNotFoundError(id);
    }
    return scenario;
  }

  /**
   * Refuse a key its organization has already given to something else.
   *
   * Takes the constructed scenario rather than the caller's string, so the comparison is between two keys the
   * aggregate normalized and a uniqueness rule that could not see `Austerity Case ` and `austerity.case` as one
   * key never arises.
   */
  private async guardKeyAvailable(scenario: Scenario): Promise<void> {
    const clash = await this.repository.findByKey(
      scenario.tenantId,
      scenario.organizationId,
      scenario.scenarioKey,
    );
    if (clash) {
      throw new DuplicateScenarioKeyError(scenario.scenarioKey);
    }
  }

  /** Load, apply a guarded pure transition, save, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (scenario: Scenario, ...args: TArgs) => Scenario,
    announce: (scenario: Scenario) => DomainEvent,
    ...args: TArgs
  ): Promise<Scenario> {
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
