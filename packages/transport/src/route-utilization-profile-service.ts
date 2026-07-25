import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { RouteNotFoundError, RouteUtilizationProfileNotFoundError } from "./errors";
import type {
  RouteRepository,
  RouteUtilizationProfileRepository,
  TransportSubscriptionRepository,
  VehicleAssignmentRepository,
  VehicleRepository,
} from "./ports";
import { computeSeatUtilization, summarizeFleetUtilization } from "./route-schedule";
import {
  createRouteUtilizationProfile,
  profileMemberView,
  refreshRouteUtilizationProfile,
  type RouteUtilizationProfile,
} from "./route-utilization-profile";
import { utilizationRefreshed } from "./transport-events";
import type { FleetUtilizationSummary } from "./transport-view";

export interface RouteUtilizationProfileServiceDeps {
  readonly repository: RouteUtilizationProfileRepository;
  readonly routes: RouteRepository;
  readonly assignments: VehicleAssignmentRepository;
  readonly vehicles: VehicleRepository;
  readonly subscriptions: TransportSubscriptionRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for route utilization profiles — the descriptive seat-usage read model. `refresh`
 * reconciles a route's active subscriber count against its active assignment's vehicle capacity through
 * the pure seat-utilization engine, and upserts the profile (creating it on first sight, refreshing and
 * version-bumping thereafter). `fleetSummaryFor` rolls an organization's profiles up through the pure
 * `summarizeFleetUtilization`. The profile is never a transaction; it is always derived.
 */
export class RouteUtilizationProfileService {
  private readonly repository: RouteUtilizationProfileRepository;
  private readonly routes: RouteRepository;
  private readonly assignments: VehicleAssignmentRepository;
  private readonly vehicles: VehicleRepository;
  private readonly subscriptions: TransportSubscriptionRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: RouteUtilizationProfileServiceDeps) {
    this.repository = deps.repository;
    this.routes = deps.routes;
    this.assignments = deps.assignments;
    this.vehicles = deps.vehicles;
    this.subscriptions = deps.subscriptions;
    this.events = deps.events;
  }

  async refresh(tenantId: TenantId, routeId: Uuid): Promise<RouteUtilizationProfile> {
    const route = await this.routes.findById(tenantId, routeId);
    if (!route) {
      throw new RouteNotFoundError(routeId);
    }
    const assignment = await this.assignments.findActiveByRoute(tenantId, routeId);
    let capacity = 0;
    if (assignment) {
      const vehicle = await this.vehicles.findById(tenantId, assignment.vehicleId);
      capacity = vehicle?.seatingCapacity ?? 0;
    }
    const subscriberCount = (await this.subscriptions.listActiveByRoute(tenantId, routeId)).length;
    const utilization = computeSeatUtilization(capacity, subscriberCount);
    const hasActiveAssignment = assignment !== null;
    const existing = await this.repository.findByRoute(tenantId, routeId);
    const profile = existing
      ? refreshRouteUtilizationProfile(existing, route.code, utilization, hasActiveAssignment)
      : createRouteUtilizationProfile({
          tenantId,
          organizationId: route.organizationId,
          routeId,
          routeCode: route.code,
          utilization,
          hasActiveAssignment,
        });
    await this.repository.save(profile);
    await this.emit(utilizationRefreshed(profile));
    return profile;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<RouteUtilizationProfile> {
    const profile = await this.repository.findById(tenantId, id);
    if (!profile) {
      throw new RouteUtilizationProfileNotFoundError(id);
    }
    return profile;
  }

  async getForRoute(tenantId: TenantId, routeId: Uuid): Promise<RouteUtilizationProfile> {
    const profile = await this.repository.findByRoute(tenantId, routeId);
    if (!profile) {
      throw new RouteUtilizationProfileNotFoundError(routeId);
    }
    return profile;
  }

  async listForOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<RouteUtilizationProfile[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  /** Roll an organization's route profiles into a fleet-utilization summary through the pure engine. */
  async fleetSummaryFor(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<FleetUtilizationSummary> {
    const profiles = await this.repository.listByOrganization(tenantId, organizationId);
    return summarizeFleetUtilization(profiles.map(profileMemberView));
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
