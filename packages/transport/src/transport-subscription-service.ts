import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateSubscriptionError,
  RouteNotActiveError,
  RouteNotFoundError,
  StopNotOnRouteError,
  StudentNotFoundForTransportError,
  SubscriptionNotFoundError,
} from "./errors";
import type { RouteRepository, StudentDirectory, TransportSubscriptionRepository } from "./ports";
import { isRouteActive, routeHasStop } from "./route";
import {
  activateSubscription,
  endSubscription,
  type RequestSubscriptionParams,
  requestSubscription,
  resumeSubscription,
  suspendSubscription,
  type TransportSubscription,
} from "./transport-subscription";
import {
  subscriptionActivated,
  subscriptionEnded,
  subscriptionRequested,
  subscriptionResumed,
  subscriptionSuspended,
} from "./transport-events";

/** The service request input — the organization is derived from the student, not supplied. */
export type RequestSubscriptionInput = Omit<RequestSubscriptionParams, "organizationId">;

export interface TransportSubscriptionServiceDeps {
  readonly repository: TransportSubscriptionRepository;
  readonly students: StudentDirectory;
  readonly routes: RouteRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for transport subscriptions — a student's enrollment on a route. Requests a
 * subscription (deriving the organization from the student, requiring an active route, validating the
 * pickup/drop stops are on the route, and enforcing one open subscription per student per route), and
 * drives the `requested → active → suspended → ended` lifecycle, publishing the subscription events.
 */
export class TransportSubscriptionService {
  private readonly repository: TransportSubscriptionRepository;
  private readonly students: StudentDirectory;
  private readonly routes: RouteRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: TransportSubscriptionServiceDeps) {
    this.repository = deps.repository;
    this.students = deps.students;
    this.routes = deps.routes;
    this.events = deps.events;
  }

  async request(input: RequestSubscriptionInput): Promise<TransportSubscription> {
    const organizationId = await this.students.organizationOf(input.tenantId, input.studentId);
    if (organizationId === null) {
      throw new StudentNotFoundForTransportError(input.studentId);
    }
    const route = await this.routes.findById(input.tenantId, input.routeId);
    if (!route) {
      throw new RouteNotFoundError(input.routeId);
    }
    if (!isRouteActive(route)) {
      throw new RouteNotActiveError(input.routeId);
    }
    if (!routeHasStop(route, input.pickupStopKey)) {
      throw new StopNotOnRouteError(input.routeId, input.pickupStopKey);
    }
    if (!routeHasStop(route, input.dropStopKey)) {
      throw new StopNotOnRouteError(input.routeId, input.dropStopKey);
    }
    if (
      await this.repository.findOpenByStudentAndRoute(
        input.tenantId,
        input.studentId,
        input.routeId,
      )
    ) {
      throw new DuplicateSubscriptionError(input.studentId, input.routeId);
    }
    const subscription = requestSubscription({ ...input, organizationId });
    await this.repository.save(subscription);
    await this.emit(subscriptionRequested(subscription));
    return subscription;
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<TransportSubscription> {
    const updated = activateSubscription(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(subscriptionActivated(updated));
    return updated;
  }

  async suspend(tenantId: TenantId, id: Uuid): Promise<TransportSubscription> {
    const updated = suspendSubscription(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(subscriptionSuspended(updated));
    return updated;
  }

  async resume(tenantId: TenantId, id: Uuid): Promise<TransportSubscription> {
    const updated = resumeSubscription(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(subscriptionResumed(updated));
    return updated;
  }

  async end(
    tenantId: TenantId,
    id: Uuid,
    effectiveTo?: string | null,
  ): Promise<TransportSubscription> {
    const updated = endSubscription(await this.require(tenantId, id), effectiveTo);
    await this.repository.save(updated);
    await this.emit(subscriptionEnded(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<TransportSubscription> {
    return this.require(tenantId, id);
  }

  async listForStudent(tenantId: TenantId, studentId: Uuid): Promise<TransportSubscription[]> {
    return this.repository.listByStudent(tenantId, studentId);
  }

  async listForRoute(tenantId: TenantId, routeId: Uuid): Promise<TransportSubscription[]> {
    return this.repository.listByRoute(tenantId, routeId);
  }

  async listForOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<TransportSubscription[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  /** The count of active subscribers on a route (feeds seat utilization). */
  async countActiveForRoute(tenantId: TenantId, routeId: Uuid): Promise<number> {
    return (await this.repository.listActiveByRoute(tenantId, routeId)).length;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<TransportSubscription> {
    const subscription = await this.repository.findById(tenantId, id);
    if (!subscription) {
      throw new SubscriptionNotFoundError(id);
    }
    return subscription;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
