import type { EventBus } from "@knowget/events";
import type { DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  IntegrationEndpointNotFoundError,
  OutboundDeliveryNotFoundError,
  WebhookSubscriptionNotFoundError,
} from "./errors";
import {
  deliveryAbandoned,
  deliveryDeadLettered,
  deliveryFailed,
  deliveryReplayed,
  deliveryScheduled,
  deliverySucceeded,
} from "./gateway-events";
import { normalizeKey } from "./gateway-value";
import {
  type DeliveryFailure,
  type OutboundDelivery,
  type ScheduleOutboundDeliveryParams,
  abandonOutboundDelivery,
  recordDeliveryFailure,
  recordDeliverySuccess,
  replayOutboundDelivery,
  scheduleOutboundDelivery,
} from "./outbound-delivery";
import type {
  IntegrationEndpointRepository,
  OutboundDeliveryRepository,
  WebhookSubscriptionRepository,
} from "./ports";
import type { WebhookSubscription } from "./webhook-subscription";

/** One event, ready to be fanned out to whoever asked for it. */
export interface DispatchEventRequest {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly eventType: string;
  /** The event's own identifier. What makes a repeated dispatch idempotent rather than a second send. */
  readonly eventId: Uuid;
  /** A digest of the payload. The payload itself never reaches this package. */
  readonly payloadFingerprint: string;
}

/**
 * Application service for outbound deliveries — the record of what the institution promised to send outward,
 * what happened when it tried, and what is owed.
 *
 * This service owns the *ledger*, not the sending. `@knowget/jobs` makes the call, applies the timeout and hands
 * the result back through {@link OutboundDeliveryService.recordSuccess} and
 * {@link OutboundDeliveryService.recordFailure}. Keeping the two apart is what makes the delivery history a
 * durable, queryable fact rather than a property of whichever worker process happened to be running, and it is
 * why this package can answer *did we send it* after a restart, a redeploy or a year.
 *
 * **{@link OutboundDeliveryService.dispatch} is idempotent per subscription and event, and that is the whole
 * design.** Fan-out is the one operation here that touches many records, so it is also the one that can fail
 * halfway: four subscriptions matched, two deliveries written, the process died. The obvious repair is to run it
 * again, and the obvious repair is only safe if running it again is free. So each subscription's delivery is
 * looked up by the event id before it is written, and one that is already there is left exactly as it is —
 * including one that already succeeded, and including one that dead-lettered. Re-dispatching must not resurrect
 * a delivery somebody has already investigated and closed.
 *
 * The dedupe is per subscription rather than per event, because two subscriptions asking for the same event are
 * two integrators who each need to hear it once.
 *
 * **A replay goes where the subscription points now, not where the original went.** The ordinary reason a
 * delivery dead-lettered is that its receiver was unreachable, and the ordinary remedy is that the consumer
 * moved it — so replaying to the address that failed would reliably fail again, and the operator replaying it
 * would conclude the receiver is still broken. The endpoint is therefore read from the subscription at the
 * moment of the replay, and the aggregate takes it as an argument rather than copying it, so the choice is made
 * somewhere it can be seen.
 *
 * **A failure emits one of two different events depending on where it left the delivery.** The aggregate decides
 * whether an attempt was the last one — it plans the backoff from its own attempt count, which is the only count
 * that cannot be stale — and this service reads the outcome it produced rather than predicting it. A retryable
 * failure and an exhausted one are not degrees of the same news: one is a receiver having a bad afternoon, the
 * other is an event somebody's system will never receive unless a person intervenes.
 */
export interface OutboundDeliveryServiceDeps {
  readonly repository: OutboundDeliveryRepository;
  readonly subscriptions: WebhookSubscriptionRepository;
  readonly endpoints: IntegrationEndpointRepository;
  readonly events?: Pick<EventBus, "publish">;
}

export class OutboundDeliveryService {
  private readonly repository: OutboundDeliveryRepository;
  private readonly subscriptions: WebhookSubscriptionRepository;
  private readonly endpoints: IntegrationEndpointRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: OutboundDeliveryServiceDeps) {
    this.repository = deps.repository;
    this.subscriptions = deps.subscriptions;
    this.endpoints = deps.endpoints;
    this.events = deps.events;
  }

  // --- Scheduling ------------------------------------------------------------------

  /**
   * Fan one event out to every subscription currently asking for it.
   *
   * Returns only what this call scheduled. A second dispatch of the same event returns an empty list, which is
   * the correct answer and a more useful one than the full set: a caller retrying a partial fan-out wants to
   * know what it just did, not what was already true.
   *
   * Subscriptions that are paused, suspended or revoked never appear, because the read excludes them. That is
   * deliberate: a paused subscription is not a delivery held back, it is a delivery that was never owed, and
   * writing one to be skipped later would leave every operator's dead-letter queue full of things nobody asked
   * for.
   */
  async dispatch(request: DispatchEventRequest): Promise<readonly OutboundDelivery[]> {
    const eventType = normalizeKey(request.eventType);
    const interested = await this.subscriptions.listInterestedIn(
      request.tenantId,
      request.organizationId,
      eventType,
    );

    const scheduled: OutboundDelivery[] = [];
    for (const subscription of interested) {
      const existing = await this.repository.findBySubscriptionAndEvent(
        request.tenantId,
        subscription.id,
        request.eventId,
      );
      if (existing) continue;

      const delivery = scheduleOutboundDelivery({
        tenantId: request.tenantId,
        organizationId: request.organizationId,
        subscriptionId: subscription.id,
        endpointId: subscription.endpointId,
        eventType,
        eventId: request.eventId,
        payloadFingerprint: request.payloadFingerprint,
        deliveryMode: subscription.deliveryMode,
      });
      await this.repository.save(delivery);
      await this.emit(deliveryScheduled(delivery));
      scheduled.push(delivery);
    }
    return scheduled;
  }

  /**
   * Schedule one delivery directly, against a subscription named by the caller.
   *
   * The single-record door {@link OutboundDeliveryService.dispatch} is the bulk one for. Used where the event
   * did not come off the bus — a manual resend of something the fan-out predates, or a targeted delivery an
   * operator is composing — and it carries no dedupe, because a caller naming one subscription and one event id
   * has already decided this delivery should exist.
   */
  async schedule(params: ScheduleOutboundDeliveryParams): Promise<OutboundDelivery> {
    const delivery = scheduleOutboundDelivery(params);
    await this.requireSubscription(params.tenantId, params.subscriptionId);
    await this.requireEndpoint(params.tenantId, params.endpointId);
    await this.repository.save(delivery);
    await this.emit(deliveryScheduled(delivery));
    return delivery;
  }

  // --- Attempts --------------------------------------------------------------------

  /** Record that an attempt was accepted. The delivery is settled and the failure text is cleared. */
  async recordSuccess(
    tenantId: TenantId,
    id: Uuid,
    statusCode: number | null,
    at: ISODateString,
  ): Promise<OutboundDelivery> {
    const next = recordDeliverySuccess(await this.require(tenantId, id), statusCode, at);
    await this.repository.save(next);
    await this.emit(deliverySucceeded(next));
    return next;
  }

  /**
   * Record that an attempt failed, and let the aggregate decide whether another one is owed.
   *
   * Two events, one for each place the aggregate can leave the delivery, chosen from the outcome it produced
   * rather than from a prediction made here. Predicting would mean re-deriving the backoff plan from a count
   * this service read a moment earlier, which is exactly the staleness the aggregate computes its own plan to
   * avoid.
   */
  async recordFailure(
    tenantId: TenantId,
    id: Uuid,
    failure: DeliveryFailure,
    at: ISODateString,
  ): Promise<OutboundDelivery> {
    const next = recordDeliveryFailure(await this.require(tenantId, id), failure, at);
    await this.repository.save(next);
    await this.emit(
      next.outcome === "dead_lettered" ? deliveryDeadLettered(next) : deliveryFailed(next),
    );
    return next;
  }

  // --- Ending ----------------------------------------------------------------------

  /** Give up on a delivery deliberately. The reason is required, because nothing else records it. */
  async abandon(tenantId: TenantId, id: Uuid, reason: string): Promise<OutboundDelivery> {
    const next = abandonOutboundDelivery(await this.require(tenantId, id), reason);
    await this.repository.save(next);
    await this.emit(deliveryAbandoned(next));
    return next;
  }

  /**
   * Send a dead-lettered delivery again, as a new record pointed at wherever its subscription now sends.
   *
   * The original is left untouched — see the class comment and the aggregate's. What is returned is the replay,
   * so the caller holds the record that is going to be attempted rather than the one that already failed.
   */
  async replay(tenantId: TenantId, id: Uuid): Promise<OutboundDelivery> {
    const original = await this.require(tenantId, id);
    const subscription = await this.requireSubscription(tenantId, original.subscriptionId);
    const replay = replayOutboundDelivery(original, subscription.endpointId);
    await this.repository.save(replay);
    await this.emit(deliveryReplayed(replay));
    return replay;
  }

  // --- Reading ---------------------------------------------------------------------

  /** One delivery, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<OutboundDelivery> {
    return this.require(tenantId, id);
  }

  /**
   * What is owed and due, across the whole tenant, for the worker that makes the calls.
   *
   * Tenant-wide and not per institution, because a delivery worker drains a queue rather than serving a school.
   * Ordering is the repository's, and the worker is expected to treat the result as a set: two workers reading
   * the same window is a race the delivery record settles, not one this read prevents.
   */
  async listDue(tenantId: TenantId, asOf: ISODateString): Promise<readonly OutboundDelivery[]> {
    return this.repository.listDue(tenantId, asOf);
  }

  /** Every delivery ever made for one subscription, settled or not. One integrator's whole history. */
  async listBySubscription(
    tenantId: TenantId,
    subscriptionId: Uuid,
  ): Promise<readonly OutboundDelivery[]> {
    return this.repository.listBySubscription(tenantId, subscriptionId);
  }

  /**
   * What the institution failed to deliver and stopped trying to.
   *
   * The list somebody works through. Every entry is an event a consumer's system does not know about, and the
   * two things an operator does with one — replay it or abandon it — both start here.
   */
  async listDeadLettered(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<readonly OutboundDelivery[]> {
    return this.repository.listDeadLettered(tenantId, organizationId);
  }

  /** Every delivery in the tenant, in every outcome. */
  async list(tenantId: TenantId): Promise<readonly OutboundDelivery[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The delivery under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<OutboundDelivery> {
    const delivery = await this.repository.findById(tenantId, id);
    if (!delivery) {
      throw new OutboundDeliveryNotFoundError(id);
    }
    return delivery;
  }

  /** The subscription this delivery belongs to, returned because the caller needs its endpoint. */
  private async requireSubscription(
    tenantId: TenantId,
    subscriptionId: Uuid,
  ): Promise<WebhookSubscription> {
    const subscription = await this.subscriptions.findById(tenantId, subscriptionId);
    if (!subscription) {
      throw new WebhookSubscriptionNotFoundError(subscriptionId);
    }
    return subscription;
  }

  /** The endpoint a directly scheduled delivery names is one the platform knows about. */
  private async requireEndpoint(tenantId: TenantId, endpointId: Uuid): Promise<void> {
    if (!(await this.endpoints.findById(tenantId, endpointId))) {
      throw new IntegrationEndpointNotFoundError(endpointId);
    }
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
