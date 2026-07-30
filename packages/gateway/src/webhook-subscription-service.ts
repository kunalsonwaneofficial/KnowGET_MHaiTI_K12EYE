import type { EventBus } from "@knowget/events";
import type { DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import { isApiConsumerRetired } from "./api-consumer";
import {
  ApiConsumerNotFoundError,
  ConsumerRetiredError,
  EndpointRetiredError,
  IntegrationEndpointNotFoundError,
  UnknownEventTypeError,
  WebhookSubscriptionNotFoundError,
} from "./errors";
import {
  subscriptionCreated,
  subscriptionPaused,
  subscriptionResumed,
  subscriptionRevoked,
  subscriptionSuspended,
} from "./gateway-events";
import { normalizeKey } from "./gateway-value";
import type {
  ApiConsumerRepository,
  EventTypeCatalogue,
  IntegrationEndpointRepository,
  WebhookSubscriptionRepository,
} from "./ports";
import {
  type CreateWebhookSubscriptionParams,
  type SubscriptionOutcome,
  type WebhookSubscription,
  createWebhookSubscription,
  pauseWebhookSubscription,
  rebindSubscriptionEndpoint,
  recordSubscriptionOutcome,
  renameWebhookSubscription,
  requireUnusedSubscriptionKey,
  resubscribeWebhookSubscription,
  resumeWebhookSubscription,
  revokeWebhookSubscription,
  rotateSubscriptionSecret,
  suspendWebhookSubscription,
} from "./webhook-subscription";

/**
 * Application service for webhook subscriptions — what each integrator has asked to be told about, and where
 * they have asked to be told it.
 *
 * The aggregate owns a subscription's lifecycle, its failure run and the shape of its filter. Four rules need
 * records the aggregate has never seen, and they live here.
 *
 * **Every event type subscribed to is one the platform actually emits.** The single most valuable check in this
 * service, and the only one whose absence produces no symptom at all. Subscriptions match event types exactly,
 * with no wildcards, which is the right rule and has one consequence: a mistyped type is not a subscription that
 * misbehaves, it is a subscription that is permanently and silently empty. Nothing errors, nothing dead-letters,
 * no counter moves, no alert fires. The consumer learns about it weeks later when somebody downstream notices
 * their data is stale, and by then nobody remembers who typed the string. Subscription time is the only moment
 * anybody is looking at it.
 *
 * **The consumer exists and has not been retired.** A subscription is owned by a consumer — the deliveries are
 * theirs, the key is unique within them, and the credentials that read them are theirs. Created against a
 * retired consumer it would sit there matching events and dispatching to somebody the institution has finished
 * with, which is an offboarding that did not take.
 *
 * **The endpoint exists and has not been retired.** Checked at creation and again at every rebind, because both
 * are the same mistake and the rebind is the one made under time pressure. A retired endpoint is refused rather
 * than a non-active one: an endpoint that is registered but not yet activated is the ordinary state of an
 * integration being set up, and refusing it would force the two halves of one afternoon's work into an order
 * nobody has a reason to follow.
 *
 * **The key is unused within the consumer, not within the tenant.** Two integrators both calling theirs
 * `enrolments` are not in conflict; a tenant-wide rule would make one of them rename a subscription because of a
 * choice the other made, which is a conversation neither can have.
 *
 * What is announced and what is not follows the rule the rest of this package does. The lifecycle moves are
 * announced, because a subscription that stops being sent to is a fact the receiving side and the operations
 * side both act on. Changing the filter, the endpoint, the label or the secret is not: the consumer is the one
 * who asked for the change and the platform is the only other party.
 *
 * {@link WebhookSubscriptionService.recordOutcome} is likewise silent. It is called once per delivery attempt,
 * which at any real volume is the highest-frequency write in this package, and an event per attempt would
 * publish the delivery log to every subscriber on the bus. The delivery aggregate already emits what a
 * subscriber needs; this only moves the counters an operator reads.
 */
export interface WebhookSubscriptionServiceDeps {
  readonly repository: WebhookSubscriptionRepository;
  readonly consumers: ApiConsumerRepository;
  readonly endpoints: IntegrationEndpointRepository;
  readonly eventTypes: EventTypeCatalogue;
  readonly events?: Pick<EventBus, "publish">;
}

export class WebhookSubscriptionService {
  private readonly repository: WebhookSubscriptionRepository;
  private readonly consumers: ApiConsumerRepository;
  private readonly endpoints: IntegrationEndpointRepository;
  private readonly eventTypes: EventTypeCatalogue;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: WebhookSubscriptionServiceDeps) {
    this.repository = deps.repository;
    this.consumers = deps.consumers;
    this.endpoints = deps.endpoints;
    this.eventTypes = deps.eventTypes;
    this.events = deps.events;
  }

  // --- Creation --------------------------------------------------------------------

  /** Subscribe a consumer to a set of event types, delivered through one endpoint. */
  async create(params: CreateWebhookSubscriptionParams): Promise<WebhookSubscription> {
    const subscription = createWebhookSubscription(params);
    await this.requireConsumer(params.tenantId, params.consumerId);
    await this.requireEndpoint(params.tenantId, params.endpointId);
    await this.requireEventTypes(subscription.eventTypes);
    await this.requireKeyFree(subscription);
    await this.repository.save(subscription);
    await this.emit(subscriptionCreated(subscription));
    return subscription;
  }

  /** Change the label the consumer sees. The key deliveries are attributed to does not move. */
  async rename(tenantId: TenantId, id: Uuid, displayName: string): Promise<WebhookSubscription> {
    return this.revise(tenantId, id, renameWebhookSubscription, displayName);
  }

  /**
   * Replace the set of event types wholesale.
   *
   * The new set is checked against the catalogue exactly as the original was, because a resubscription is every
   * bit as capable of naming something that does not exist — more so, since it is usually made months later by
   * somebody working from a changelog rather than from the catalogue.
   *
   * Deliveries already scheduled are untouched. They were selected against the set that was in force when the
   * event happened, which is the set the consumer had asked for at the time.
   */
  async resubscribe(
    tenantId: TenantId,
    id: Uuid,
    eventTypes: readonly string[],
  ): Promise<WebhookSubscription> {
    const next = resubscribeWebhookSubscription(await this.require(tenantId, id), eventTypes);
    await this.requireEventTypes(next.eventTypes);
    await this.repository.save(next);
    return next;
  }

  /** Send this subscription's deliveries through a different endpoint, leaving the filter alone. */
  async rebindEndpoint(
    tenantId: TenantId,
    id: Uuid,
    endpointId: Uuid,
  ): Promise<WebhookSubscription> {
    const next = rebindSubscriptionEndpoint(await this.require(tenantId, id), endpointId);
    await this.requireEndpoint(tenantId, next.endpointId);
    await this.repository.save(next);
    return next;
  }

  /** Point the subscription at a different signing secret, or at none. */
  async rotateSecret(
    tenantId: TenantId,
    id: Uuid,
    secretRef: string | null,
  ): Promise<WebhookSubscription> {
    return this.revise(tenantId, id, rotateSubscriptionSecret, secretRef);
  }

  // --- Lifecycle -------------------------------------------------------------------

  /** Stop sending at the consumer's own request. No reason is asked for; it is their subscription. */
  async pause(tenantId: TenantId, id: Uuid): Promise<WebhookSubscription> {
    return this.transition(tenantId, id, pauseWebhookSubscription, subscriptionPaused);
  }

  /** Stop sending because the receiver has been refusing everything. The reason travels with the event. */
  async suspend(tenantId: TenantId, id: Uuid, reason: string): Promise<WebhookSubscription> {
    return this.transition(tenantId, id, suspendWebhookSubscription, subscriptionSuspended, reason);
  }

  /** Start sending again, from a pause or a suspension alike. The failure run resets. */
  async resume(tenantId: TenantId, id: Uuid): Promise<WebhookSubscription> {
    return this.transition(tenantId, id, resumeWebhookSubscription, subscriptionResumed);
  }

  /** End the subscription. Terminal, and the record stays readable for the deliveries it owns. */
  async revoke(tenantId: TenantId, id: Uuid): Promise<WebhookSubscription> {
    return this.transition(tenantId, id, revokeWebhookSubscription, subscriptionRevoked);
  }

  // --- Observation -----------------------------------------------------------------

  /**
   * Record how one delivery attempt ended.
   *
   * Silent by design — see the class comment. This is the counter an operator reads when deciding whether a
   * subscription is failing or merely idle, and the two stamps it moves are what make that distinction possible
   * at all.
   */
  async recordOutcome(
    tenantId: TenantId,
    id: Uuid,
    outcome: SubscriptionOutcome,
    at: ISODateString,
  ): Promise<WebhookSubscription> {
    return this.revise(tenantId, id, recordSubscriptionOutcome, outcome, at);
  }

  // --- Reading ---------------------------------------------------------------------

  /** One subscription, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<WebhookSubscription> {
    return this.require(tenantId, id);
  }

  /** One subscription by the key its own consumer refers to it with, or a 404. */
  async getByKey(
    tenantId: TenantId,
    consumerId: Uuid,
    subscriptionKey: string,
  ): Promise<WebhookSubscription> {
    const key = normalizeKey(subscriptionKey);
    const subscription = await this.repository.findByKey(tenantId, consumerId, key);
    if (!subscription) {
      throw new WebhookSubscriptionNotFoundError(key);
    }
    return subscription;
  }

  /** Everything one consumer has subscribed to, in every status. Their own view of their integration. */
  async listByConsumer(
    tenantId: TenantId,
    consumerId: Uuid,
  ): Promise<readonly WebhookSubscription[]> {
    return this.repository.listByConsumer(tenantId, consumerId);
  }

  /**
   * Everything that would be affected by one endpoint going away.
   *
   * The read that makes retiring an endpoint an informed decision rather than a hopeful one. An operator about
   * to take an endpoint out of service is asking which integrators stop hearing from the institution, and this
   * is the only question whose answer is a list of people.
   */
  async listByEndpoint(
    tenantId: TenantId,
    endpointId: Uuid,
  ): Promise<readonly WebhookSubscription[]> {
    return this.repository.listByEndpoint(tenantId, endpointId);
  }

  /**
   * Who is currently being sent one event type, for one institution.
   *
   * The dispatch read: an event happens, this answers who asked for it, and a delivery is scheduled per answer.
   * Subscriptions not currently being sent to are excluded by the read, so pausing is a fact about the record
   * rather than a filter somebody has to remember to apply at dispatch time.
   */
  async listInterestedIn(
    tenantId: TenantId,
    organizationId: Uuid,
    eventType: string,
  ): Promise<readonly WebhookSubscription[]> {
    return this.repository.listInterestedIn(tenantId, organizationId, normalizeKey(eventType));
  }

  /** Every subscription in the tenant, revoked ones included. */
  async list(tenantId: TenantId): Promise<readonly WebhookSubscription[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The subscription under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<WebhookSubscription> {
    const subscription = await this.repository.findById(tenantId, id);
    if (!subscription) {
      throw new WebhookSubscriptionNotFoundError(id);
    }
    return subscription;
  }

  /** The consumer this subscription belongs to exists and is somebody the institution still deals with. */
  private async requireConsumer(tenantId: TenantId, consumerId: Uuid): Promise<void> {
    const consumer = await this.consumers.findById(tenantId, consumerId);
    if (!consumer) {
      throw new ApiConsumerNotFoundError(consumerId);
    }
    if (isApiConsumerRetired(consumer)) {
      throw new ConsumerRetiredError(consumerId);
    }
  }

  /** The endpoint deliveries go through exists and has not been retired. */
  private async requireEndpoint(tenantId: TenantId, endpointId: Uuid): Promise<void> {
    const endpoint = await this.endpoints.findById(tenantId, endpointId);
    if (!endpoint) {
      throw new IntegrationEndpointNotFoundError(endpointId);
    }
    if (endpoint.status === "retired") {
      throw new EndpointRetiredError(endpointId);
    }
  }

  /**
   * Every event type named is one the platform emits.
   *
   * The first unknown type is the one reported, rather than all of them, because the set has already been sorted
   * and de-duplicated by the aggregate and a caller correcting one typo will resubmit the whole set anyway. The
   * cost of the alternative is a refusal that has to carry a list, and a list is harder to act on than a name.
   */
  private async requireEventTypes(eventTypes: readonly string[]): Promise<void> {
    for (const eventType of eventTypes) {
      if (!(await this.eventTypes.exists(eventType))) {
        throw new UnknownEventTypeError(eventType);
      }
    }
  }

  /** No other subscription belonging to this consumer already answers to this key. */
  private async requireKeyFree(subscription: WebhookSubscription): Promise<void> {
    const siblings = await this.repository.listByConsumer(
      subscription.tenantId,
      subscription.consumerId,
    );
    requireUnusedSubscriptionKey(
      siblings.filter((other) => other.id !== subscription.id),
      subscription.consumerId,
      subscription.subscriptionKey,
    );
  }

  /** Load, apply a pure revision, save. Nothing is announced; see the class comment. */
  private async revise<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (subscription: WebhookSubscription, ...args: TArgs) => WebhookSubscription,
    ...args: TArgs
  ): Promise<WebhookSubscription> {
    const next = move(await this.require(tenantId, id), ...args);
    await this.repository.save(next);
    return next;
  }

  /** Load, apply a guarded pure transition, save, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (subscription: WebhookSubscription, ...args: TArgs) => WebhookSubscription,
    announce: (subscription: WebhookSubscription) => DomainEvent,
    ...args: TArgs
  ): Promise<WebhookSubscription> {
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
