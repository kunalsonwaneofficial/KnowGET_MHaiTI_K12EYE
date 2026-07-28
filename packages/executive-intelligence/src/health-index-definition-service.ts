import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  indexDefined,
  indexPublished,
  indexRenamed,
  indexRetired,
  indexReweighted,
  indexSuperseded,
} from "./command-events";
import { normalizeIndexKey } from "./command-value";
import type { PillarWeight } from "./command-view";
import {
  DuplicateIndexKeyError,
  HealthIndexDefinitionNotFoundError,
  OrganizationNotFoundForCommandError,
  SupersessionKeyMismatchError,
} from "./errors";
import {
  type DefineHealthIndexParams,
  type HealthIndexDefinition,
  type RenameHealthIndexParams,
  defineHealthIndex,
  publishHealthIndex,
  renameHealthIndex,
  retireHealthIndex,
  reweightHealthIndex,
  supersedeHealthIndex,
} from "./health-index-definition";
import type { HealthIndexDefinitionRepository, OrganizationDirectory } from "./ports";

/** A recomposition: the definition that stepped down, and the one that took over from it. */
export interface RecompositionResult {
  readonly superseded: HealthIndexDefinition;
  readonly successor: HealthIndexDefinition;
}

/**
 * Application service for health index definitions — how an institution has decided to weigh itself.
 *
 * The invariant this service exists to hold is **one composition in force per series**. A key names a series,
 * every assessment pins the definition it ran under, and two published definitions on one key would leave a
 * reader unable to say which composition produced last term's number. The aggregate cannot hold that: it knows
 * its own status and nothing about its siblings.
 *
 * The rule is spent at **publication and nowhere else**, which is a deliberate choice about where to be strict.
 * Drafting a second definition on a live key is allowed, because that is exactly how a leadership team argues
 * about next year's weighting over several sittings while this year's index keeps running — and a platform that
 * refused to save those drafts would push the argument into a spreadsheet, which is the workflow this contract
 * exists to replace. What is refused is the moment the second composition would go live beside the first.
 *
 * {@link recompose} is the remedy the aggregate's refusal to reweight a published definition points at, made
 * into one call. It supersedes the incumbent and publishes a reweighted successor together, and the order of
 * the two writes is chosen rather than incidental: the incumbent steps down **first**. If the second write
 * failed, the key would be left briefly with no composition in force — under which an assessment refuses
 * outright and is told why — instead of with two, under which an assessment would silently pick one. A gap that
 * stops the machine beats an ambiguity that feeds it.
 *
 * Supersession is where this service resolves what the aggregate would not. `supersedeHealthIndex` records a
 * successor id without checking it, because a lookup inside an aggregate is a second opinion about what exists;
 * here the successor is loaded and its key compared, so the chain a reader walks backwards through cannot be
 * pointed at a different series.
 */
export interface HealthIndexDefinitionServiceDeps {
  readonly repository: HealthIndexDefinitionRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class HealthIndexDefinitionService {
  private readonly repository: HealthIndexDefinitionRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: HealthIndexDefinitionServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  // --- Authoring -------------------------------------------------------------------

  /** Declare a composition. Starts as a draft, which is the state its weighting can still move in. */
  async define(params: DefineHealthIndexParams): Promise<HealthIndexDefinition> {
    const definition = defineHealthIndex(params);
    await this.requireOrganization(params.tenantId, params.organizationId);
    await this.repository.save(definition);
    await this.emit(indexDefined(definition));
    return definition;
  }

  /** Move the weights. Draft only; the aggregate refuses from publication onward and names the remedy. */
  async reweight(
    tenantId: TenantId,
    id: Uuid,
    weights: readonly PillarWeight[],
  ): Promise<HealthIndexDefinition> {
    return this.transition(tenantId, id, reweightHealthIndex, indexReweighted, weights);
  }

  /** Change what the index is called. Permitted while published: a label does not compute a value. */
  async rename(
    tenantId: TenantId,
    id: Uuid,
    params: RenameHealthIndexParams,
  ): Promise<HealthIndexDefinition> {
    return this.transition(tenantId, id, renameHealthIndex, indexRenamed, params);
  }

  // --- Lifecycle -------------------------------------------------------------------

  /**
   * Put a composition into service, once no other composition of the same series is already in it.
   *
   * The incumbent is looked up by key rather than trusted from the caller, and the comparison is by id so that
   * re-publishing something already published is refused by the aggregate's own transition guard rather than
   * misreported here as a duplicate.
   */
  async publish(tenantId: TenantId, id: Uuid): Promise<HealthIndexDefinition> {
    const definition = await this.require(tenantId, id);
    const incumbent = await this.repository.findPublishedByKey(tenantId, definition.indexKey);
    if (incumbent && incumbent.id !== definition.id) {
      throw new DuplicateIndexKeyError(definition.indexKey);
    }

    const next = publishHealthIndex(definition);
    await this.repository.save(next);
    await this.emit(indexPublished(next));
    return next;
  }

  /**
   * Hand one composition's job to another that already exists.
   *
   * The successor is resolved here and its key compared, which is the check the aggregate could not make. A
   * successor belonging to a different series would break the walk backwards through an institution's
   * reweightings, and the break would only surface for whoever was trying to explain a movement across it.
   */
  async supersede(tenantId: TenantId, id: Uuid, successorId: Uuid): Promise<HealthIndexDefinition> {
    const definition = await this.require(tenantId, id);
    const successor = await this.require(tenantId, successorId);
    if (successor.indexKey !== definition.indexKey) {
      throw new SupersessionKeyMismatchError(definition.indexKey, successor.indexKey);
    }

    const next = supersedeHealthIndex(definition, successor.id);
    await this.repository.save(next);
    await this.emit(indexSuperseded(next));
    return next;
  }

  /**
   * Change how the institution weighs itself, in one operation, without restating its own history.
   *
   * Both pure moves are made before either is written, so a refusal from either — the incumbent is not
   * published, the new weights do not validate — leaves the series exactly as it was. The successor inherits the
   * incumbent's key, grain, name and description, because a recomposition changes the weighting and nothing
   * else; an institution that also wants to rename the series does that afterwards, where the rename is visible
   * as its own act.
   */
  async recompose(
    tenantId: TenantId,
    id: Uuid,
    weights: readonly PillarWeight[],
  ): Promise<RecompositionResult> {
    const incumbent = await this.require(tenantId, id);
    const successor = publishHealthIndex(
      defineHealthIndex({
        tenantId: incumbent.tenantId,
        organizationId: incumbent.organizationId,
        indexKey: incumbent.indexKey,
        name: incumbent.name,
        description: incumbent.description,
        grain: incumbent.grain,
        weights,
      }),
    );
    const superseded = supersedeHealthIndex(incumbent, successor.id);

    await this.repository.save(superseded);
    await this.repository.save(successor);

    await this.emit(indexSuperseded(superseded));
    await this.emit(indexDefined(successor));
    await this.emit(indexPublished(successor));
    return { superseded, successor };
  }

  /** Stop computing this composition. Reachable from a draft too: an abandoned argument is still memory. */
  async retire(tenantId: TenantId, id: Uuid): Promise<HealthIndexDefinition> {
    return this.transition(tenantId, id, retireHealthIndex, indexRetired);
  }

  // --- Reading ---------------------------------------------------------------------

  /** One definition, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<HealthIndexDefinition> {
    return this.require(tenantId, id);
  }

  /** The composition currently in force for a series, or `null` when none is. */
  async findPublished(tenantId: TenantId, indexKey: string): Promise<HealthIndexDefinition | null> {
    return this.repository.findPublishedByKey(tenantId, normalizeIndexKey(indexKey));
  }

  /** Every composition a series has ever had, in the order they were authored. */
  async listByKey(tenantId: TenantId, indexKey: string): Promise<readonly HealthIndexDefinition[]> {
    return this.repository.listByKey(tenantId, normalizeIndexKey(indexKey));
  }

  /** Every definition in the tenant. */
  async list(tenantId: TenantId): Promise<readonly HealthIndexDefinition[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The definition under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<HealthIndexDefinition> {
    const definition = await this.repository.findById(tenantId, id);
    if (!definition) {
      throw new HealthIndexDefinitionNotFoundError(id);
    }
    return definition;
  }

  /** The institution this composition would belong to, checked through the directory port. */
  private async requireOrganization(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForCommandError(organizationId);
    }
  }

  /** Load, apply a guarded pure transition, save, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (definition: HealthIndexDefinition, ...args: TArgs) => HealthIndexDefinition,
    announce: (definition: HealthIndexDefinition) => DomainEvent,
    ...args: TArgs
  ): Promise<HealthIndexDefinition> {
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
