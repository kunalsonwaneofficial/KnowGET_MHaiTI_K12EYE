import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  kpiActivated,
  kpiDefined,
  kpiRenamed,
  kpiRescaled,
  kpiRetargeted,
  kpiRetired,
} from "./command-events";
import { normalizeKpiKey } from "./command-value";
import type { MeasurementScale } from "./command-view";
import {
  DuplicateKpiKeyError,
  KpiDefinitionNotFoundError,
  OrganizationNotFoundForCommandError,
} from "./errors";
import {
  type DefineKpiParams,
  type KpiDefinition,
  type RenameKpiParams,
  activateKpi,
  defineKpi,
  renameKpi,
  retargetKpi,
  retireKpi,
  reviseKpiScale,
} from "./kpi-definition";
import type { KpiDefinitionRepository, OrganizationDirectory } from "./ports";

/**
 * Application service for KPI definitions — what an institution has decided to measure about itself.
 *
 * Two things live here that the aggregate deliberately refused to hold.
 *
 * The first is **key uniqueness**. A KPI key is how a panel, a pillar roll-up, a reading and a board paper all
 * address the same indicator, so two definitions answering to one key would make a single series that silently
 * changed what it measured partway through. The aggregate cannot enforce that: it holds one definition and has
 * no directory of the others, and a uniqueness check invented inside it would be a second opinion about what
 * exists. So it normalizes the key and this service asks the store whether it is taken — including keys held by
 * retired definitions, because a retired definition still owns the scale its readings were scored against.
 *
 * The second is **that the organization is real**. Every record in this contract hangs off an institution node
 * owned by another domain, and a definition attached to an organization that does not exist is a row nobody can
 * reach and nobody can clean up. The check is a directory port rather than an import, which is what keeps this
 * package free of a dependency on the domain that owns organizations.
 *
 * Order matters in `define` and it is not the obvious one. The aggregate is constructed **first**, before either
 * round trip, so a malformed request is refused without touching the store at all; then the organization, then
 * the key. The key check has to come after construction anyway, because the key it must check is the normalized
 * one the definition would be stored under rather than the string the caller happened to type.
 */
export interface KpiDefinitionServiceDeps {
  readonly repository: KpiDefinitionRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class KpiDefinitionService {
  private readonly repository: KpiDefinitionRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: KpiDefinitionServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  // --- Declaring -------------------------------------------------------------------

  /** Declare an indicator, once the institution it belongs to exists and its key is free. */
  async define(params: DefineKpiParams): Promise<KpiDefinition> {
    const definition = defineKpi(params);
    await this.requireOrganization(params.tenantId, params.organizationId);
    await this.requireKeyFree(params.tenantId, definition.kpiKey);
    await this.repository.save(definition);
    await this.emit(kpiDefined(definition));
    return definition;
  }

  /** Re-anchor what *good* means, while the definition is still a draft and no reading exists. */
  async reviseScale(tenantId: TenantId, id: Uuid, scale: MeasurementScale): Promise<KpiDefinition> {
    return this.transition(tenantId, id, reviseKpiScale, kpiRescaled, scale);
  }

  /** Change how the indicator describes itself. Never its key, which nothing here can move. */
  async rename(tenantId: TenantId, id: Uuid, params: RenameKpiParams): Promise<KpiDefinition> {
    return this.transition(tenantId, id, renameKpi, kpiRenamed, params);
  }

  /** Move the score the institution is aiming at, or clear it with `null`. */
  async retarget(tenantId: TenantId, id: Uuid, targetScore: number | null): Promise<KpiDefinition> {
    return this.transition(tenantId, id, retargetKpi, kpiRetargeted, targetScore);
  }

  // --- Lifecycle -------------------------------------------------------------------

  /** Put the indicator into service. The scale freezes here, and readings become possible. */
  async activate(tenantId: TenantId, id: Uuid): Promise<KpiDefinition> {
    return this.transition(tenantId, id, activateKpi, kpiActivated);
  }

  /** Stop measuring it. The definition stays, because its readings still need their scale. */
  async retire(tenantId: TenantId, id: Uuid): Promise<KpiDefinition> {
    return this.transition(tenantId, id, retireKpi, kpiRetired);
  }

  // --- Reading ---------------------------------------------------------------------

  /** One definition, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<KpiDefinition> {
    return this.require(tenantId, id);
  }

  /**
   * One definition by the key everything else addresses it under, or a 404.
   *
   * The key is normalized before the lookup and the refusal names the normalized form, so a caller who typed a
   * stray capital is told which key was actually searched for rather than the one they sent.
   */
  async getByKey(tenantId: TenantId, kpiKey: string): Promise<KpiDefinition> {
    const wanted = normalizeKpiKey(kpiKey);
    const definition = await this.repository.findByKey(tenantId, wanted);
    if (!definition) {
      throw new KpiDefinitionNotFoundError(wanted);
    }
    return definition;
  }

  /** Everything an institution is currently measuring. What a roll-up walks. */
  async listActive(tenantId: TenantId, organizationId: Uuid): Promise<readonly KpiDefinition[]> {
    return this.repository.listActive(tenantId, organizationId);
  }

  /** Every definition in the tenant, drafts and retired ones included. */
  async list(tenantId: TenantId): Promise<readonly KpiDefinition[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The definition under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<KpiDefinition> {
    const definition = await this.repository.findById(tenantId, id);
    if (!definition) {
      throw new KpiDefinitionNotFoundError(id);
    }
    return definition;
  }

  /** The institution this record would hang off, checked through the directory port. */
  private async requireOrganization(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForCommandError(organizationId);
    }
  }

  /**
   * No other definition already answers to this key.
   *
   * Tenant-wide rather than per organization. A key is what a briefing quotes and what a group-level panel binds
   * to, and a trust running two schools whose `attendance.rate` meant different things would have no way to say
   * so at the point somebody read the number.
   */
  private async requireKeyFree(tenantId: TenantId, kpiKey: string): Promise<void> {
    if (await this.repository.findByKey(tenantId, kpiKey)) {
      throw new DuplicateKpiKeyError(kpiKey);
    }
  }

  /** Load, apply a guarded pure transition, save, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (definition: KpiDefinition, ...args: TArgs) => KpiDefinition,
    announce: (definition: KpiDefinition) => DomainEvent,
    ...args: TArgs
  ): Promise<KpiDefinition> {
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
