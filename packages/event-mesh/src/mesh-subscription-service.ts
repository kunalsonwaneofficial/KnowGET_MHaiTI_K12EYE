import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateConsumerGroupError,
  DuplicateMeshSubscriptionKeyError,
  EventStreamNotFoundError,
  MeshSubscriptionNotFoundError,
  OrganizationNotFoundForMeshError,
  PersonNotFoundForMeshError,
  SubscriptionStreamNotReadableError,
} from "./errors";
import {
  subscriptionActivated,
  subscriptionDeliveryRevised,
  subscriptionPaused,
  subscriptionRefiltered,
  subscriptionRegistered,
  subscriptionRetired,
} from "./mesh-events";
import {
  type MeshSubscription,
  type RegisterMeshSubscriptionParams,
  activateMeshSubscription,
  pauseMeshSubscription,
  refilterMeshSubscription,
  registerMeshSubscription,
  retireMeshSubscription,
  reviseSubscriptionDelivery,
} from "./mesh-subscription";
import { type DeliverySemantics, type FilterPredicate, normalizeKey } from "./mesh-value";
import type {
  EventStreamRepository,
  MeshSubscriptionRepository,
  OrganizationDirectory,
  PersonDirectory,
} from "./ports";

/**
 * Application service for mesh subscriptions — who reads a stream, what of it they want, what the mesh promises
 * them about delivery, and whether they are being delivered to at all right now.
 *
 * The aggregate settles what a subscription can settle alone: the filter is validated whole and replaced whole,
 * the attempt ceiling is checked against the platform range, a retired subscription is reconfigured no further,
 * and the first activation is the one that stamps who started reading. Three rules need the rest of the tenant.
 *
 * **A subscription key names one consumer in the tenant, and retirement does not release it.** Checkpoints and
 * dead letters refer to a subscription by key, so reissuing a retired one hands a brand new consumer the
 * committed positions of a dead one — which presents as a consumer that starts life having already processed a
 * month it has never seen, and which nobody diagnoses as a name collision. The check runs tenant-wide for the
 * same reason the stream namespace does: a key that means one thing at one school and another at the school
 * next door cannot be read at the trust level at all.
 *
 * **One consumer group reads one stream once.** A group is the unit a checkpoint belongs to, so two
 * subscriptions on a stream sharing a group commit positions over each other, each appearing to advance while
 * skipping whatever the other committed past. It is the failure in this package with the longest delay between
 * cause and symptom: nothing errors, neither subscription reports lag, and the loss is found by somebody
 * reconciling totals months afterwards. The refusal is per stream rather than tenant-wide, because a group
 * reading two different streams is one consumer with two checkpoints and is entirely ordinary.
 *
 * **The stream has to exist, and it must not be finished.** A draft stream is subscribed to before it opens,
 * which is the order institutions bring a channel up in and the same latitude {@link EventStreamService} gives
 * a stream naming drafted event types; a paused one is subscribed to because a pause is a state it comes back
 * from. A retired stream is refused, because {@link SubscriptionStreamNotReadableError} is the only warning
 * anybody gets before a consumer waits forever on a channel that will never carry anything again.
 *
 * **Activation is attributed.** Beginning delivery is the act that starts a consumer receiving institutional
 * facts, and `activatedBy` is stamped once and kept across every later pause, because the question worth
 * answering months afterwards is who started this consumer rather than who last resumed it.
 */
export interface MeshSubscriptionServiceDeps {
  readonly repository: MeshSubscriptionRepository;
  readonly streams: EventStreamRepository;
  readonly organizations: OrganizationDirectory;
  readonly people: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class MeshSubscriptionService {
  private readonly repository: MeshSubscriptionRepository;
  private readonly streams: EventStreamRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly people: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: MeshSubscriptionServiceDeps) {
    this.repository = deps.repository;
    this.streams = deps.streams;
    this.organizations = deps.organizations;
    this.people = deps.people;
    this.events = deps.events;
  }

  // --- Definition ------------------------------------------------------------------

  /**
   * Register a consumer. It receives nothing until it is activated.
   *
   * The aggregate runs first, so a malformed filter and an attempt ceiling outside the range are refused
   * before a single read — a consumer being brought up by somebody working through a form should learn that
   * their filter names an attribute the envelope does not carry without the tenant being scanned for it.
   */
  async register(params: RegisterMeshSubscriptionParams): Promise<MeshSubscription> {
    const subscription = registerMeshSubscription(params);
    await this.requireOrganization(subscription.tenantId, subscription.organizationId);
    await this.requireKeyFree(subscription);
    await this.requireReadableStream(subscription);
    await this.requireConsumerGroupFree(subscription);
    await this.repository.save(subscription);
    await this.emit(subscriptionRegistered(subscription));
    return subscription;
  }

  /** Replace what the consumer wants off its stream, which a live subscription still permits. */
  async refilter(
    tenantId: TenantId,
    id: Uuid,
    filter: readonly FilterPredicate[],
  ): Promise<MeshSubscription> {
    return this.transition(tenantId, id, refilterMeshSubscription, subscriptionRefiltered, filter);
  }

  /** Change the delivery promise and the attempt ceiling together, because neither means much alone. */
  async reviseDelivery(
    tenantId: TenantId,
    id: Uuid,
    semantics: DeliverySemantics,
    maxAttempts: number,
  ): Promise<MeshSubscription> {
    return this.transition(
      tenantId,
      id,
      reviseSubscriptionDelivery,
      subscriptionDeliveryRevised,
      semantics,
      maxAttempts,
    );
  }

  // --- Lifecycle -------------------------------------------------------------------

  /** Begin delivering, from registration or from a pause, in the name of whoever started the consumer. */
  async activate(tenantId: TenantId, id: Uuid, activatedBy: Uuid): Promise<MeshSubscription> {
    await this.requirePerson(tenantId, activatedBy, "person activating the subscription");
    return this.transition(
      tenantId,
      id,
      activateMeshSubscription,
      subscriptionActivated,
      activatedBy,
    );
  }

  /** Stop delivering and hold the checkpoint still, which is what makes a consumer deployment safe. */
  async pause(tenantId: TenantId, id: Uuid): Promise<MeshSubscription> {
    return this.transition(tenantId, id, pauseMeshSubscription, subscriptionPaused);
  }

  /** Finish with the consumer. Its key stays taken, because its checkpoints keep referring to it. */
  async retire(tenantId: TenantId, id: Uuid): Promise<MeshSubscription> {
    return this.transition(tenantId, id, retireMeshSubscription, subscriptionRetired);
  }

  // --- Reading ---------------------------------------------------------------------

  /** One subscription, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<MeshSubscription> {
    return this.require(tenantId, id);
  }

  /** One subscription by the key its checkpoints refer to it with, or a 404 naming the normalised key. */
  async getByKey(tenantId: TenantId, subscriptionKey: string): Promise<MeshSubscription> {
    const key = normalizeKey(subscriptionKey);
    const subscription = await this.repository.findByKey(tenantId, key);
    if (!subscription) {
      throw new MeshSubscriptionNotFoundError(key);
    }
    return subscription;
  }

  /**
   * Every consumer on one stream, in every status.
   *
   * What pausing or retiring a stream is decided from: that is a claim about everybody reading it, and the
   * operator making it needs the registered and paused consumers in front of them as well as the live ones.
   */
  async listByStream(tenantId: TenantId, streamKey: string): Promise<readonly MeshSubscription[]> {
    return this.repository.listByStream(tenantId, normalizeKey(streamKey));
  }

  /** The routing candidate set for one stream: the consumers a message arriving on it may go to. */
  async listDeliverable(
    tenantId: TenantId,
    streamKey: string,
  ): Promise<readonly MeshSubscription[]> {
    return this.repository.listDeliverable(tenantId, normalizeKey(streamKey));
  }

  /** Every subscription in the tenant, in every status. */
  async list(tenantId: TenantId): Promise<readonly MeshSubscription[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The subscription under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<MeshSubscription> {
    const subscription = await this.repository.findById(tenantId, id);
    if (!subscription) {
      throw new MeshSubscriptionNotFoundError(id);
    }
    return subscription;
  }

  /** The institution this consumer belongs to, checked through the directory port. */
  private async requireOrganization(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForMeshError(organizationId);
    }
  }

  /** One person, checked against the directory. */
  private async requirePerson(tenantId: TenantId, personId: Uuid, role: string): Promise<void> {
    if (!(await this.people.exists(tenantId, personId))) {
      throw new PersonNotFoundForMeshError(personId, role);
    }
  }

  /** The key is not already taken in this tenant, retired subscriptions included. */
  private async requireKeyFree(subscription: MeshSubscription): Promise<void> {
    if (await this.repository.findByKey(subscription.tenantId, subscription.subscriptionKey)) {
      throw new DuplicateMeshSubscriptionKeyError(subscription.subscriptionKey);
    }
  }

  /**
   * The stream exists and is one a consumer can still expect something from.
   *
   * A missing stream is a 404 naming the key, because the ordinary cause is a typo in it. A retired stream is
   * a conflict naming the status, because the key was right and the channel is closed, and those two have
   * nothing in common as remedies.
   */
  private async requireReadableStream(subscription: MeshSubscription): Promise<void> {
    const stream = await this.streams.findByKey(subscription.tenantId, subscription.streamKey);
    if (!stream) {
      throw new EventStreamNotFoundError(subscription.streamKey);
    }
    if (stream.status === "retired") {
      throw new SubscriptionStreamNotReadableError(
        subscription.subscriptionKey,
        subscription.streamKey,
        stream.status,
      );
    }
  }

  /** No other subscription on this stream already commits its checkpoints under this group. */
  private async requireConsumerGroupFree(subscription: MeshSubscription): Promise<void> {
    const onStream = await this.repository.listByStream(
      subscription.tenantId,
      subscription.streamKey,
    );
    const taken = onStream.some((other) => other.consumerGroup === subscription.consumerGroup);
    if (taken) {
      throw new DuplicateConsumerGroupError(subscription.streamKey, subscription.consumerGroup);
    }
  }

  /** Load, apply a guarded pure transition, save, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (subscription: MeshSubscription, ...args: TArgs) => MeshSubscription,
    announce: (subscription: MeshSubscription) => DomainEvent,
    ...args: TArgs
  ): Promise<MeshSubscription> {
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
