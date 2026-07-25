import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateRouteCodeError,
  OrganizationNotFoundForTransportError,
  RouteNotFoundError,
} from "./errors";
import type { OrganizationDirectory, RouteRepository } from "./ports";
import {
  activateRoute,
  addRouteStop,
  type DraftRouteParams,
  draftRoute,
  removeRouteStop,
  renameRoute,
  resumeRoute,
  retireRoute,
  type Route,
  setRouteDeparture,
  suspendRoute,
} from "./route";
import type { RouteStopInput } from "./route-stop";
import { routeActivated, routeResumed, routeRetired, routeSuspended } from "./transport-events";

export interface RouteServiceDeps {
  readonly repository: RouteRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for routes. Drafts a route (validating the organization and a unique code), edits
 * its stops and departure while draft, and drives the `draft → active → suspended → retired` lifecycle,
 * publishing the route events. An active route can take vehicle assignments and student subscriptions.
 */
export class RouteService {
  private readonly repository: RouteRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: RouteServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async draft(input: DraftRouteParams): Promise<Route> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForTransportError(input.organizationId);
    }
    if (await this.repository.findByCode(input.tenantId, input.code.trim())) {
      throw new DuplicateRouteCodeError(input.code.trim());
    }
    const route = draftRoute(input);
    await this.repository.save(route);
    return route;
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<Route> {
    return this.mutate(tenantId, id, (r) => renameRoute(r, name));
  }

  async setDeparture(tenantId: TenantId, id: Uuid, departureMinutes: number): Promise<Route> {
    return this.mutate(tenantId, id, (r) => setRouteDeparture(r, departureMinutes));
  }

  async addStop(tenantId: TenantId, id: Uuid, input: RouteStopInput): Promise<Route> {
    return this.mutate(tenantId, id, (r) => addRouteStop(r, input));
  }

  async removeStop(tenantId: TenantId, id: Uuid, key: string): Promise<Route> {
    return this.mutate(tenantId, id, (r) => removeRouteStop(r, key));
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<Route> {
    const updated = activateRoute(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(routeActivated(updated));
    return updated;
  }

  async suspend(tenantId: TenantId, id: Uuid): Promise<Route> {
    const updated = suspendRoute(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(routeSuspended(updated));
    return updated;
  }

  async resume(tenantId: TenantId, id: Uuid): Promise<Route> {
    const updated = resumeRoute(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(routeResumed(updated));
    return updated;
  }

  async retire(tenantId: TenantId, id: Uuid): Promise<Route> {
    const updated = retireRoute(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(routeRetired(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Route> {
    return this.require(tenantId, id);
  }

  async getByCode(tenantId: TenantId, code: string): Promise<Route> {
    const route = await this.repository.findByCode(tenantId, code);
    if (!route) {
      throw new RouteNotFoundError(code);
    }
    return route;
  }

  async list(tenantId: TenantId): Promise<Route[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Route[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(tenantId: TenantId, id: Uuid, fn: (route: Route) => Route): Promise<Route> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Route> {
    const route = await this.repository.findById(tenantId, id);
    if (!route) {
      throw new RouteNotFoundError(id);
    }
    return route;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
