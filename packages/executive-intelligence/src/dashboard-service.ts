import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  dashboardArchived,
  dashboardDefined,
  dashboardPanelsSet,
  dashboardPublished,
  dashboardRenamed,
} from "./command-events";
import { normalizeDashboardKey } from "./command-value";
import type { DashboardPanel } from "./command-view";
import {
  type Dashboard,
  type DefineDashboardParams,
  type RenameDashboardParams,
  archiveDashboard,
  composeDashboard,
  defineDashboard,
  isDashboardPublished,
  publishDashboard,
  renameDashboard,
  setDashboardPanels,
} from "./dashboard";
import {
  DashboardNotFoundError,
  DuplicateDashboardKeyError,
  OrganizationNotFoundForCommandError,
} from "./errors";
import type { DashboardRepository, OrganizationDirectory } from "./ports";

/**
 * Application service for dashboards — what an institution decided to look at, and who gets to see which of it.
 *
 * Two things live here that the aggregate could not hold: that the key is free, and that the organization is
 * real. Both for the reasons every other service in this contract holds them — a dashboard has no directory of
 * its siblings, and this package never imports the domain that owns institution nodes.
 *
 * The third thing is where the contract's *role-aware* actually lands, and it is split deliberately across two
 * reads rather than fused into one.
 *
 * {@link DashboardService.view} is the viewer's path: resolve by key, require publication, compose down to what
 * the reader's scopes reach. An unpublished dashboard answers as absent rather than as forbidden, which is not
 * politeness — telling a reader that something exists but is not ready discloses that an institution is drafting
 * a view of itself, and to whoever is asking that is the interesting half of the answer.
 *
 * {@link DashboardService.compose} is the author's path: the same composition against arbitrary scopes, at any
 * status. An author binding a panel to a scope needs to be able to ask what a principal holding it would actually
 * be served, and there is no other way to find out — composition removes withheld panels rather than blanking
 * them, so a wrong binding is invisible from the inside. Answering that question before publication is the entire
 * point of the dashboard being a draft first.
 *
 * There is no visibility filter on the list read, and the asymmetry with briefings is intentional. A dashboard
 * whose every panel a reader is withheld composes to an empty page, which is a coherent thing to be served; a
 * briefing composed down to the findings somebody may see would be an argument with its evidence removed. So
 * dashboards filter panels and briefings filter documents, and neither borrows the other's rule.
 */
export interface DashboardServiceDeps {
  readonly repository: DashboardRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class DashboardService {
  private readonly repository: DashboardRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: DashboardServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  // --- Authoring -------------------------------------------------------------------

  /** Declare a dashboard. Starts as a draft, which is where its panel bindings can still be got wrong safely. */
  async define(params: DefineDashboardParams): Promise<Dashboard> {
    const dashboard = defineDashboard(params);
    await this.requireOrganization(params.tenantId, params.organizationId);
    await this.requireKeyFree(params.tenantId, dashboard.dashboardKey);
    await this.repository.save(dashboard);
    await this.emit(dashboardDefined(dashboard));
    return dashboard;
  }

  /** Replace what the dashboard shows. Wholesale, because the panels' order is their layout. */
  async setPanels(
    tenantId: TenantId,
    id: Uuid,
    panels: readonly DashboardPanel[],
  ): Promise<Dashboard> {
    return this.transition(tenantId, id, setDashboardPanels, dashboardPanelsSet, panels);
  }

  /** Change what the dashboard is called. Never its key, which a saved link resolves through. */
  async rename(tenantId: TenantId, id: Uuid, params: RenameDashboardParams): Promise<Dashboard> {
    return this.transition(tenantId, id, renameDashboard, dashboardRenamed, params);
  }

  // --- Lifecycle -------------------------------------------------------------------

  /** Make it openable. The aggregate refuses a panel set that would serve somebody a broken page. */
  async publish(tenantId: TenantId, id: Uuid): Promise<Dashboard> {
    return this.transition(tenantId, id, publishDashboard, dashboardPublished);
  }

  /** Take it out of service without erasing what the institution once wanted to look at. */
  async archive(tenantId: TenantId, id: Uuid): Promise<Dashboard> {
    return this.transition(tenantId, id, archiveDashboard, dashboardArchived);
  }

  // --- Reading ---------------------------------------------------------------------

  /**
   * What a reader holding these scopes is served for this key.
   *
   * A draft or archived dashboard answers as absent, so the reply to a reader who may not have it is the same
   * reply as for a key that was never used.
   */
  async view(
    tenantId: TenantId,
    dashboardKey: string,
    grantedScopes: readonly string[],
  ): Promise<readonly DashboardPanel[]> {
    const wanted = normalizeDashboardKey(dashboardKey);
    const dashboard = await this.repository.findByKey(tenantId, wanted);
    if (!dashboard || !isDashboardPublished(dashboard)) {
      throw new DashboardNotFoundError(wanted);
    }
    return composeDashboard(dashboard, grantedScopes);
  }

  /** What a reader holding these scopes would be served of this dashboard, whatever its status. */
  async compose(
    tenantId: TenantId,
    id: Uuid,
    grantedScopes: readonly string[],
  ): Promise<readonly DashboardPanel[]> {
    return composeDashboard(await this.require(tenantId, id), grantedScopes);
  }

  /** One dashboard whole, panels and all. The author's read; never what a viewer is served. */
  async get(tenantId: TenantId, id: Uuid): Promise<Dashboard> {
    return this.require(tenantId, id);
  }

  /** One dashboard whole by the key it is addressed under, or a 404 naming the normalized key. */
  async getByKey(tenantId: TenantId, dashboardKey: string): Promise<Dashboard> {
    const wanted = normalizeDashboardKey(dashboardKey);
    const dashboard = await this.repository.findByKey(tenantId, wanted);
    if (!dashboard) {
      throw new DashboardNotFoundError(wanted);
    }
    return dashboard;
  }

  /** The dashboards an institution's readers may open. Drafts and archives are not among them. */
  async listPublished(tenantId: TenantId, organizationId: Uuid): Promise<readonly Dashboard[]> {
    return this.repository.listPublished(tenantId, organizationId);
  }

  /** Every dashboard in the tenant, drafts and archives included. */
  async list(tenantId: TenantId): Promise<readonly Dashboard[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The dashboard under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<Dashboard> {
    const dashboard = await this.repository.findById(tenantId, id);
    if (!dashboard) {
      throw new DashboardNotFoundError(id);
    }
    return dashboard;
  }

  /** The institution this dashboard would belong to, checked through the directory port. */
  private async requireOrganization(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForCommandError(organizationId);
    }
  }

  /**
   * No other dashboard already answers to this key.
   *
   * Tenant-wide, and it includes archived dashboards. Reusing the key of something taken out of service would
   * make every saved link to the old page resolve to a new one, which is worse than a dead link because nobody
   * would notice they were looking at something else.
   */
  private async requireKeyFree(tenantId: TenantId, dashboardKey: string): Promise<void> {
    if (await this.repository.findByKey(tenantId, dashboardKey)) {
      throw new DuplicateDashboardKeyError(dashboardKey);
    }
  }

  /** Load, apply a guarded pure transition, save, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (dashboard: Dashboard, ...args: TArgs) => Dashboard,
    announce: (dashboard: Dashboard) => DomainEvent,
    ...args: TArgs
  ): Promise<Dashboard> {
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
