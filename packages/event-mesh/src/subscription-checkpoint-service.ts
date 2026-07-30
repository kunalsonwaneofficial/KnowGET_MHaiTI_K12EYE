import type { EventBus } from "@knowget/events";
import type { DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateCheckpointError,
  EventStreamNotFoundError,
  MeshSubscriptionNotFoundError,
  MeshSubscriptionRetiredError,
  PersonNotFoundForMeshError,
  SubscriptionCheckpointNotFoundError,
} from "./errors";
import type { EventStream } from "./event-stream";
import { checkpointReset } from "./mesh-events";
import type { MeshSubscription } from "./mesh-subscription";
import { isTerminalSubscriptionStatus } from "./mesh-value";
import type { LagAssessment } from "./mesh-view";
import type {
  EventStreamRepository,
  MeshMessageRepository,
  MeshSubscriptionRepository,
  PersonDirectory,
  SubscriptionCheckpointRepository,
} from "./ports";
import {
  type SubscriptionCheckpoint,
  assessCheckpointLag,
  commitCheckpoint,
  openSubscriptionCheckpoint,
  resetSubscriptionCheckpoint,
} from "./subscription-checkpoint";

/**
 * Application service for subscription checkpoints — how far each consumer has got through each partition of
 * the stream it reads, and how far behind that leaves it.
 *
 * The aggregate holds the arithmetic that a position can be judged by alone: a commit may only move forward,
 * a commit to the position already held is a no-op down to the object, a reset carries a reason long enough to
 * be worth reading afterwards, and the partition is checked against a count. What the aggregate cannot do is
 * find out any of the numbers it checks against, and every rule below exists because one of them is a fact
 * about the rest of the tenant rather than about the checkpoint.
 *
 * **The head is read, never accepted.** {@link commitCheckpoint} and {@link resetSubscriptionCheckpoint} both
 * take the stream head as an argument and refuse a position beyond it; this service is the only thing that
 * supplies it, and it supplies it from {@link MeshMessageRepository} every time. A caller able to pass its own
 * head could commit past the end of a partition, which reads back as a consumer that has processed messages
 * nobody published and turns every lag figure on that partition into a negative number nobody believes.
 *
 * **The partition count comes from the stream.** A checkpoint's partition is only meaningful against the
 * number of partitions the stream declares, and a stream that has been repartitioned since the consumer was
 * written declares a different one. Reading the count here rather than taking it means the refusal arrives at
 * the consumer opening partition eleven of an eight-partition stream, instead of a checkpoint that exists,
 * commits happily, and is never delivered to because no message will ever be routed to a partition that is not
 * there.
 *
 * **One checkpoint per subscription per partition.** Two records for one partition is the same loss the
 * duplicate consumer group causes and arrives by a different road: each commits over the other, each looks
 * healthy, and the messages between them are skipped by whichever wrote last. It is refused on the way in
 * rather than left to the store, because the store's constraint fires at the end of a transaction that has
 * already done work, and because {@link DuplicateCheckpointError} names the partition while a constraint
 * violation names an index.
 *
 * **A retired consumer opens nothing new, and still commits.** Opening a checkpoint for a dead subscription
 * creates a position nothing will ever advance, which is indistinguishable from a stalled live consumer on
 * every lag report the institution runs. Committing on one is allowed, because a worker draining its last
 * batch after its subscription was retired is doing exactly what it should, and refusing it would leave the
 * work done and the position claiming it was not.
 *
 * **Only a reset announces.** Committing is the second busiest operation in the package and says nothing.
 * Moving a position by hand is rare, deliberate, and the one act here that can make a month of institutional
 * facts be processed twice or not at all, so it carries {@link checkpointReset} to whoever is downstream of
 * that consumer — who are the people the consequences land on and, without this, the last to hear.
 */
export interface SubscriptionCheckpointServiceDeps {
  readonly repository: SubscriptionCheckpointRepository;
  readonly subscriptions: MeshSubscriptionRepository;
  readonly streams: EventStreamRepository;
  readonly messages: MeshMessageRepository;
  readonly people: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class SubscriptionCheckpointService {
  private readonly repository: SubscriptionCheckpointRepository;
  private readonly subscriptions: MeshSubscriptionRepository;
  private readonly streams: EventStreamRepository;
  private readonly messages: MeshMessageRepository;
  private readonly people: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: SubscriptionCheckpointServiceDeps) {
    this.repository = deps.repository;
    this.subscriptions = deps.subscriptions;
    this.streams = deps.streams;
    this.messages = deps.messages;
    this.people = deps.people;
    this.events = deps.events;
  }

  // --- Definition ------------------------------------------------------------------

  /**
   * Open one consumer's position on one partition, at the beginning of it.
   *
   * The subscription is resolved before anything else because it carries the institution, the key and the
   * stream this checkpoint belongs to, none of which the caller is asked for. It opens uncommitted rather than
   * at the head: a consumer that has confirmed nothing has confirmed nothing, and starting it level with the
   * stream would silently hand it a mesh whose whole history it is recorded as having already read.
   */
  async open(
    tenantId: TenantId,
    subscriptionId: Uuid,
    partition: number,
  ): Promise<SubscriptionCheckpoint> {
    const subscription = await this.requireLiveSubscription(tenantId, subscriptionId);
    const stream = await this.requireStream(tenantId, subscription.streamKey);
    const checkpoint = openSubscriptionCheckpoint({
      tenantId,
      organizationId: subscription.organizationId,
      subscriptionId: subscription.id,
      subscriptionKey: subscription.subscriptionKey,
      streamKey: subscription.streamKey,
      partition,
      partitionCount: stream.partitionCount,
    });
    await this.requirePartitionFree(checkpoint);
    await this.repository.save(checkpoint);
    return checkpoint;
  }

  // --- Lifecycle -------------------------------------------------------------------

  /**
   * Move the position forward to what the consumer has finished with.
   *
   * A commit to the position already held is written nowhere. The aggregate hands back the same object, and
   * this returns it without a store round trip, so a well-behaved consumer re-acknowledging its batch after a
   * restart costs one read rather than a write per poll on every partition it holds.
   */
  async commit(tenantId: TenantId, id: Uuid, position: number): Promise<SubscriptionCheckpoint> {
    const checkpoint = await this.require(tenantId, id);
    const next = commitCheckpoint(checkpoint, position, await this.head(checkpoint));
    if (next === checkpoint) {
      return checkpoint;
    }
    await this.repository.save(next);
    return next;
  }

  /**
   * Move the position by hand, in somebody's name, for a reason that stays on the record.
   *
   * The person is checked before the checkpoint is loaded, as everywhere else an act is attributed: the
   * operator is not told which partition they were about to move until they are somebody the tenant knows. A
   * reset to the position already held is written and announced like any other, because deciding that where a
   * consumer stands is where it should stand is a decision, and the record of who made it is the point.
   */
  async reset(
    tenantId: TenantId,
    id: Uuid,
    position: number,
    resetBy: Uuid,
    reason: string,
  ): Promise<SubscriptionCheckpoint> {
    await this.requirePerson(tenantId, resetBy, "person resetting the checkpoint");
    const checkpoint = await this.require(tenantId, id);
    const next = resetSubscriptionCheckpoint(checkpoint, {
      position,
      streamHead: await this.head(checkpoint),
      resetBy,
      reason,
    });
    await this.repository.save(next);
    await this.emit(checkpointReset(next));
    return next;
  }

  // --- Reading ---------------------------------------------------------------------

  /** One checkpoint, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<SubscriptionCheckpoint> {
    return this.require(tenantId, id);
  }

  /** One consumer's position on one partition, which is how a worker resumes the partition it holds. */
  async getByPartition(
    tenantId: TenantId,
    subscriptionId: Uuid,
    partition: number,
  ): Promise<SubscriptionCheckpoint> {
    const checkpoint = await this.repository.findByPartition(tenantId, subscriptionId, partition);
    if (!checkpoint) {
      throw new SubscriptionCheckpointNotFoundError(`${subscriptionId} partition ${partition}`);
    }
    return checkpoint;
  }

  /** Every partition one consumer holds a position on, in partition order. */
  async listBySubscription(
    tenantId: TenantId,
    subscriptionId: Uuid,
  ): Promise<readonly SubscriptionCheckpoint[]> {
    return this.repository.listBySubscription(tenantId, subscriptionId);
  }

  /** Every checkpoint in the tenant. */
  async list(tenantId: TenantId): Promise<readonly SubscriptionCheckpoint[]> {
    return this.repository.listByTenant(tenantId);
  }

  /**
   * How far behind one checkpoint is, and how long it has stood where it stands, as of a stated moment.
   *
   * The moment is an argument because the question is asked about the past as often as the present — a
   * consumer that fell behind overnight is diagnosed the next morning, and a band computed against the moment
   * of the asking would report it as healthy again by then.
   */
  async assessLag(tenantId: TenantId, id: Uuid, asOf: ISODateString): Promise<LagAssessment> {
    const checkpoint = await this.require(tenantId, id);
    return assessCheckpointLag(checkpoint, await this.head(checkpoint), asOf);
  }

  // --- Internals -------------------------------------------------------------------

  /** The checkpoint under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<SubscriptionCheckpoint> {
    const checkpoint = await this.repository.findById(tenantId, id);
    if (!checkpoint) {
      throw new SubscriptionCheckpointNotFoundError(id);
    }
    return checkpoint;
  }

  /** The subscription, and it is one that still has a future to read into. */
  private async requireLiveSubscription(
    tenantId: TenantId,
    subscriptionId: Uuid,
  ): Promise<MeshSubscription> {
    const subscription = await this.subscriptions.findById(tenantId, subscriptionId);
    if (!subscription) {
      throw new MeshSubscriptionNotFoundError(subscriptionId);
    }
    if (isTerminalSubscriptionStatus(subscription.status)) {
      throw new MeshSubscriptionRetiredError(subscription.id);
    }
    return subscription;
  }

  /** The stream the subscription names, which is where the partition count has to come from. */
  private async requireStream(tenantId: TenantId, streamKey: string): Promise<EventStream> {
    const stream = await this.streams.findByKey(tenantId, streamKey);
    if (!stream) {
      throw new EventStreamNotFoundError(streamKey);
    }
    return stream;
  }

  /** One person, checked against the directory. */
  private async requirePerson(tenantId: TenantId, personId: Uuid, role: string): Promise<void> {
    if (!(await this.people.exists(tenantId, personId))) {
      throw new PersonNotFoundForMeshError(personId, role);
    }
  }

  /** This consumer holds no position on this partition yet. */
  private async requirePartitionFree(checkpoint: SubscriptionCheckpoint): Promise<void> {
    const held = await this.repository.findByPartition(
      checkpoint.tenantId,
      checkpoint.subscriptionId,
      checkpoint.partition,
    );
    if (held) {
      throw new DuplicateCheckpointError(checkpoint.subscriptionId, checkpoint.partition);
    }
  }

  /** The last sequence on the partition this checkpoint follows. Every position is judged against it. */
  private async head(checkpoint: SubscriptionCheckpoint): Promise<number> {
    return this.messages.streamHead(
      checkpoint.tenantId,
      checkpoint.streamKey,
      checkpoint.partition,
    );
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
