import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { type DeadLetter, isDeadLetterOpen } from "./dead-letter";
import { type EventStream, isEventStreamPublishable, streamAcceptsEventType } from "./event-stream";
import { type EventTypeDefinition, isEventTypeCarried } from "./event-type-definition";
import { type MeshMessage, isMeshMessageReplayable } from "./mesh-message";
import { type MeshSubscription, isMeshSubscriptionDeliverable } from "./mesh-subscription";
import {
  FIRST_SEQUENCE,
  type TransportKind,
  UNCOMMITTED_POSITION,
  compareText,
  fixedWidthInstant,
} from "./mesh-value";
import { type ReplayRequest, isReplayRunning } from "./replay-request";
import { type StreamBinding, isStreamBindingCarrying } from "./stream-binding";
import type { SubscriptionCheckpoint } from "./subscription-checkpoint";

/**
 * The storage and directory contracts the event mesh depends on, and nothing more.
 *
 * Every method takes the tenant explicitly and every read filters on it, on top of the row-level security the
 * adapters run under. Two independent barriers is the platform's standing position, and it is worth more here
 * than anywhere else it is applied: a mesh is the one store in the institution that holds a copy of every fact
 * every other domain has ever recorded, so a read that forgets its tenant does not leak a table, it leaks the
 * school.
 *
 * Nothing here reaches beyond this domain's own records except the three directories, which are read models
 * rather than dependencies — this domain never imports another domain package. There is deliberately no event
 * type catalogue among them. The gateway needs one because it publishes an egress allow-list of event types it
 * does not define; this package is where they are defined, so the question it would ask is answered by
 * {@link EventTypeDefinitionRepository} two sections below, and a directory beside it would be a second index
 * of the same registry that could disagree with it.
 *
 * **This package moves nothing, and there is no port through which it could.** No producer, no consumer loop,
 * no broker client, no socket. A binding is a declaration and a configuration handle; whatever actually speaks
 * Kafka, NATS or the outbox relay lives at the composition root. A `publish` here would put a network call
 * inside the one package whose entire value is that every rule in it is decidable without one — every
 * guarantee it enforces would then be true only on a machine that could reach a broker, and the tests proving
 * those guarantees would be integration tests wearing unit tests' clothes.
 *
 * **No transport reference is ever resolved here, and there is no directory that could resolve one.** A
 * `transportRef` such as `config:mesh.kafka.primary` is an address in the configuration store, and this package
 * holds it, copies it and passes it on without once asking what it points at. A directory answering *is this
 * handle live* would be an oracle that tells anybody who can call it which broker credentials exist, on the one
 * surface where a single credential reads every fact the institution has.
 *
 * **Nothing here counts, and nothing here waits.** No attempt tally, no retry timer, no deduplication ledger.
 * The delivery engine is handed `attemptsMade` and `alreadyDelivered` and returns a verdict; where those
 * numbers came from is the job runner's contract and the reliability contract's, and a counter port in this
 * file would be the beginning of a second one that drifts from the first in a way the institution discovers as
 * a duplicate enrolment rather than as an error.
 *
 * **The message store is the one thing not listable whole.** Every other repository below offers a
 * `listByTenant`; {@link MeshMessageRepository} does not, and the omission is structural. A row there exists
 * per event per stream, so the table grows with everything the institution does — an unbounded read over it is
 * an operation that passes every test, reads well in review, and takes a production database down the first
 * time it is called against a school that has been live for a year. Every read it does offer is bounded by a
 * stream, a partition, a window or a cutoff.
 *
 * **Nothing here is removable, and the one thing that looks like a deletion is not one.** Retention forgets a
 * payload through `forgetMeshMessagePayload` and a `save`, one message at a time, which is what makes every
 * forgetting a fact on the record that raises `mesh.message.payload-forgotten`. A bulk `deleteExpired` would be
 * faster and would erase the evidence that the mesh ever carried the thing somebody is asking about — and the
 * question asked of a mesh months later is almost never *what do you still hold*, it is *did you ever hold
 * this, and who did you give it to*. Every aggregate here has a way out that leaves the history intact:
 * retired, drained, discarded, cancelled, forgotten.
 */

// --- Directories -----------------------------------------------------------------

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node exist in the tenant?
 *
 * Every event type, stream, binding, subscription, message, checkpoint, dead letter and replay hangs off one.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Read model over the person domain (P2-D01-M02): does this person exist in the tenant?
 *
 * Checked wherever this contract names somebody, and every place it does is a place the name is the whole point
 * of the field: who published an event type, who activated a stream, who requested a replay and who approved
 * it. The approval pair is the sharpest case. The mesh refuses a self-approved replay by comparing two
 * identifiers, and that check is only as good as the claim that both resolve to people — an approver who
 * resolves to nobody satisfies the comparison and defeats the reason for it, and the institution finds out when
 * it asks who authorised the re-delivery of a term's worth of results and gets a UUID back.
 */
export interface PersonDirectory {
  exists(tenantId: TenantId, personId: Uuid): Promise<boolean>;
}

/**
 * Read model over the deployment's transport adapters: is there something here that speaks this backbone?
 *
 * Asked when a binding is declared, which is the only moment the mistake is cheap. A stream bound to a
 * transport nothing implements is not refused and does not error — it is declared, activated, and then
 * silently carries nothing, and the failure presents weeks later as a consumer that has never received
 * anything rather than as a configuration error somebody can act on.
 *
 * Not tenant-scoped, because an adapter is a property of the deployment rather than of a school: whether this
 * installation was built with a Kafka client is the same question for every tenant on it. The registry is asked
 * about the {@link TransportKind} alone and never about the `transportRef` beside it, which keeps this from
 * becoming the handle-resolving oracle the module comment above refuses.
 */
export interface TransportAdapterRegistry {
  serves(transport: TransportKind): Promise<boolean>;
}

// --- Event types -----------------------------------------------------------------

/**
 * Storage contract for event type definitions. Tenant-scoped (explicit argument + RLS).
 *
 * `findByKeyAndVersion` backs the identity rule the whole registry rests on: a key and a version name one
 * definition, permanently. That is the promise made to every consumer written against a shape, and a store that
 * could hold two rows for one pair would let the shape a consumer was built for change under it without
 * anything in the record saying so.
 *
 * `listByKey` is the version history of one event type, in the order the versions were cut. It is what a
 * compatibility check reads to find the version it is being compared against, what an integrator is shown when
 * asked to move off a deprecated version, and what an operator reads before deprecating anything — because the
 * answer to *is this version safe to retire* is mostly a question about what else exists beside it.
 *
 * `listCarried` is the set of definitions a producer may legitimately publish against right now: published and
 * deprecated, not drafts and not retired. A deprecated type belongs in it precisely because deprecation is a
 * notice period rather than a switch, and a producer cut off on the day of the announcement would experience an
 * orderly migration as an outage.
 */
export interface EventTypeDefinitionRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<EventTypeDefinition | null>;
  findByKeyAndVersion(
    tenantId: TenantId,
    eventTypeKey: string,
    version: number,
  ): Promise<EventTypeDefinition | null>;
  listByKey(tenantId: TenantId, eventTypeKey: string): Promise<EventTypeDefinition[]>;
  listCarried(tenantId: TenantId, organizationId: Uuid): Promise<EventTypeDefinition[]>;
  listByTenant(tenantId: TenantId): Promise<EventTypeDefinition[]>;
  save(definition: EventTypeDefinition): Promise<void>;
}

/** In-memory {@link EventTypeDefinitionRepository} — the default for tests and bootstrap. */
export class InMemoryEventTypeDefinitionRepository implements EventTypeDefinitionRepository {
  private readonly byId = new Map<string, EventTypeDefinition>();

  async findById(tenantId: TenantId, id: Uuid): Promise<EventTypeDefinition | null> {
    const definition = this.byId.get(id);
    return definition && definition.tenantId === tenantId ? definition : null;
  }

  async findByKeyAndVersion(
    tenantId: TenantId,
    eventTypeKey: string,
    version: number,
  ): Promise<EventTypeDefinition | null> {
    return (
      [...this.byId.values()].find(
        (d) => d.tenantId === tenantId && d.eventTypeKey === eventTypeKey && d.version === version,
      ) ?? null
    );
  }

  async listByKey(tenantId: TenantId, eventTypeKey: string): Promise<EventTypeDefinition[]> {
    return [...this.byId.values()]
      .filter((d) => d.tenantId === tenantId && d.eventTypeKey === eventTypeKey)
      .sort((left, right) => left.version - right.version);
  }

  async listCarried(tenantId: TenantId, organizationId: Uuid): Promise<EventTypeDefinition[]> {
    return [...this.byId.values()].filter(
      (d) =>
        d.tenantId === tenantId && d.organizationId === organizationId && isEventTypeCarried(d),
    );
  }

  async listByTenant(tenantId: TenantId): Promise<EventTypeDefinition[]> {
    return [...this.byId.values()].filter((d) => d.tenantId === tenantId);
  }

  async save(definition: EventTypeDefinition): Promise<void> {
    this.byId.set(definition.id, definition);
  }
}

// --- Streams ---------------------------------------------------------------------

/**
 * Storage contract for event streams. Tenant-scoped (explicit argument + RLS).
 *
 * `findByKey` backs the one-stream-per-key rule, retired streams included, whose keys stay taken. A key that
 * could be reissued would let a new stream inherit the messages, checkpoints and dead letters of an old one,
 * and every consumer position on the old stream would silently become a position on the new one.
 *
 * `listPublishable` is what a producer may write to right now, and it is a first-class read rather than a
 * filter somebody remembers to apply, because the version of that question a filter answers is *which streams
 * did we mean to leave active* — and the two lists differ in exactly the interesting cases.
 *
 * `listAcceptingEventType` is the reverse lookup, and it exists to make retiring an event type an informed act
 * rather than a hopeful one. Retirement is a claim that nothing carries the type any more; a claim nobody can
 * enumerate is a claim nobody can keep, and the way it fails is that a producer publishes against a retired
 * definition, the stream still accepts the key, and the mesh carries a fact whose shape is no longer promised
 * to anybody.
 */
export interface EventStreamRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<EventStream | null>;
  findByKey(tenantId: TenantId, streamKey: string): Promise<EventStream | null>;
  listPublishable(tenantId: TenantId, organizationId: Uuid): Promise<EventStream[]>;
  listAcceptingEventType(tenantId: TenantId, eventTypeKey: string): Promise<EventStream[]>;
  listByTenant(tenantId: TenantId): Promise<EventStream[]>;
  save(stream: EventStream): Promise<void>;
}

/** In-memory {@link EventStreamRepository} — the default for tests and bootstrap. */
export class InMemoryEventStreamRepository implements EventStreamRepository {
  private readonly byId = new Map<string, EventStream>();

  async findById(tenantId: TenantId, id: Uuid): Promise<EventStream | null> {
    const stream = this.byId.get(id);
    return stream && stream.tenantId === tenantId ? stream : null;
  }

  async findByKey(tenantId: TenantId, streamKey: string): Promise<EventStream | null> {
    return (
      [...this.byId.values()].find((s) => s.tenantId === tenantId && s.streamKey === streamKey) ??
      null
    );
  }

  async listPublishable(tenantId: TenantId, organizationId: Uuid): Promise<EventStream[]> {
    return [...this.byId.values()].filter(
      (s) =>
        s.tenantId === tenantId &&
        s.organizationId === organizationId &&
        isEventStreamPublishable(s),
    );
  }

  async listAcceptingEventType(tenantId: TenantId, eventTypeKey: string): Promise<EventStream[]> {
    return [...this.byId.values()]
      .filter((s) => s.tenantId === tenantId && streamAcceptsEventType(s, eventTypeKey))
      .sort((left, right) => compareText(left.streamKey, right.streamKey));
  }

  async listByTenant(tenantId: TenantId): Promise<EventStream[]> {
    return [...this.byId.values()].filter((s) => s.tenantId === tenantId);
  }

  async save(stream: EventStream): Promise<void> {
    this.byId.set(stream.id, stream);
  }
}

// --- Stream bindings -------------------------------------------------------------

/**
 * Storage contract for stream bindings. Tenant-scoped (explicit argument + RLS).
 *
 * `findByStreamAndTransport` backs the rule that one stream is bound to one backbone once. Two live bindings
 * from a stream to the same transport is not a conflict the mesh can resolve — whichever it picked would be
 * arbitrary, and it would pick consistently enough that the second binding would appear to work for months
 * before an ordering change somewhere unrelated swapped them and half the traffic went to a broker nobody was
 * watching.
 *
 * `listByStream` is how a migration is carried out and how it is proved finished. Moving a stream from the
 * outbox to a broker means both bindings exist at once, one carrying and one draining, and the operator's
 * question throughout is *what is still attached to this stream* — which is this read and not a derived one.
 *
 * `listCarrying` is the set of backbones actually moving traffic for the organization right now. A draining
 * binding is excluded because draining is the state of no longer being given anything new, and an operator
 * reading the estate needs the two apart: a binding that is carrying is a dependency, and a binding that is
 * draining is a countdown.
 */
export interface StreamBindingRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<StreamBinding | null>;
  findByStreamAndTransport(
    tenantId: TenantId,
    streamKey: string,
    transport: TransportKind,
  ): Promise<StreamBinding | null>;
  listByStream(tenantId: TenantId, streamKey: string): Promise<StreamBinding[]>;
  listCarrying(tenantId: TenantId, organizationId: Uuid): Promise<StreamBinding[]>;
  listByTenant(tenantId: TenantId): Promise<StreamBinding[]>;
  save(binding: StreamBinding): Promise<void>;
}

/** In-memory {@link StreamBindingRepository} — the default for tests and bootstrap. */
export class InMemoryStreamBindingRepository implements StreamBindingRepository {
  private readonly byId = new Map<string, StreamBinding>();

  async findById(tenantId: TenantId, id: Uuid): Promise<StreamBinding | null> {
    const binding = this.byId.get(id);
    return binding && binding.tenantId === tenantId ? binding : null;
  }

  async findByStreamAndTransport(
    tenantId: TenantId,
    streamKey: string,
    transport: TransportKind,
  ): Promise<StreamBinding | null> {
    return (
      [...this.byId.values()].find(
        (b) => b.tenantId === tenantId && b.streamKey === streamKey && b.transport === transport,
      ) ?? null
    );
  }

  async listByStream(tenantId: TenantId, streamKey: string): Promise<StreamBinding[]> {
    return [...this.byId.values()]
      .filter((b) => b.tenantId === tenantId && b.streamKey === streamKey)
      .sort((left, right) => compareText(left.createdAt, right.createdAt));
  }

  async listCarrying(tenantId: TenantId, organizationId: Uuid): Promise<StreamBinding[]> {
    return [...this.byId.values()].filter(
      (b) =>
        b.tenantId === tenantId &&
        b.organizationId === organizationId &&
        isStreamBindingCarrying(b),
    );
  }

  async listByTenant(tenantId: TenantId): Promise<StreamBinding[]> {
    return [...this.byId.values()].filter((b) => b.tenantId === tenantId);
  }

  async save(binding: StreamBinding): Promise<void> {
    this.byId.set(binding.id, binding);
  }
}

// --- Subscriptions ---------------------------------------------------------------

/**
 * Storage contract for mesh subscriptions. Tenant-scoped (explicit argument + RLS).
 *
 * `findByKey` backs the one-subscription-per-key rule, retired subscriptions included. The reason a retired key
 * stays taken is the checkpoint table: positions are held against a subscription, and a reissued key would hand
 * a brand new consumer the committed positions of a dead one, which presents as a consumer that starts life
 * having already processed a month it has never seen.
 *
 * `listDeliverable` is the routing candidate set for one stream, and it is per stream rather than per
 * organization because that is the shape routing actually asks in: a message arrives on a stream and the
 * question is who on that stream is entitled to it. An organization-wide read would hand the routing engine
 * every subscription in the school on every message and let it discard the ones on other streams, which is the
 * same answer computed at a cost that grows with the institution rather than with the stream.
 *
 * `listByStream` is the same set without the status filter, and it is what makes a stream's lifecycle
 * enforceable: pausing or retiring a stream is a claim about every consumer reading it, and the operator
 * making that claim needs the paused and registered ones in front of them too.
 */
export interface MeshSubscriptionRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<MeshSubscription | null>;
  findByKey(tenantId: TenantId, subscriptionKey: string): Promise<MeshSubscription | null>;
  listByStream(tenantId: TenantId, streamKey: string): Promise<MeshSubscription[]>;
  listDeliverable(tenantId: TenantId, streamKey: string): Promise<MeshSubscription[]>;
  listByTenant(tenantId: TenantId): Promise<MeshSubscription[]>;
  save(subscription: MeshSubscription): Promise<void>;
}

/** In-memory {@link MeshSubscriptionRepository} — the default for tests and bootstrap. */
export class InMemoryMeshSubscriptionRepository implements MeshSubscriptionRepository {
  private readonly byId = new Map<string, MeshSubscription>();

  async findById(tenantId: TenantId, id: Uuid): Promise<MeshSubscription | null> {
    const subscription = this.byId.get(id);
    return subscription && subscription.tenantId === tenantId ? subscription : null;
  }

  async findByKey(tenantId: TenantId, subscriptionKey: string): Promise<MeshSubscription | null> {
    return (
      [...this.byId.values()].find(
        (s) => s.tenantId === tenantId && s.subscriptionKey === subscriptionKey,
      ) ?? null
    );
  }

  async listByStream(tenantId: TenantId, streamKey: string): Promise<MeshSubscription[]> {
    return [...this.byId.values()]
      .filter((s) => s.tenantId === tenantId && s.streamKey === streamKey)
      .sort((left, right) => compareText(left.subscriptionKey, right.subscriptionKey));
  }

  async listDeliverable(tenantId: TenantId, streamKey: string): Promise<MeshSubscription[]> {
    return [...this.byId.values()]
      .filter(
        (s) =>
          s.tenantId === tenantId && s.streamKey === streamKey && isMeshSubscriptionDeliverable(s),
      )
      .sort((left, right) => compareText(left.subscriptionKey, right.subscriptionKey));
  }

  async listByTenant(tenantId: TenantId): Promise<MeshSubscription[]> {
    return [...this.byId.values()].filter((s) => s.tenantId === tenantId);
  }

  async save(subscription: MeshSubscription): Promise<void> {
    this.byId.set(subscription.id, subscription);
  }
}

// --- Messages --------------------------------------------------------------------

/**
 * Whether one message was recorded inside a window, in the fixed width every instant comparison here assumes.
 *
 * Read against `recordedAt` rather than `occurredAt`, for the reason {@link MeshMessage.recordedAt} exists at
 * all: retention runs from when the mesh took custody, so a window bounded by occurrence would ask for messages
 * that were retained outside it, and a replay would be refused for a retention breach it did not commit.
 */
const withinWindow = (
  message: MeshMessage,
  fromInstant: ISODateString,
  toInstant: ISODateString,
): boolean => {
  const recordedAt = fixedWidthInstant(message.recordedAt);
  return recordedAt >= fixedWidthInstant(fromInstant) && recordedAt <= fixedWidthInstant(toInstant);
};

/**
 * Storage contract for mesh messages. Tenant-scoped (explicit argument + RLS).
 *
 * This is the one repository in the package with no `listByTenant`, and the module comment above says why.
 * Everything below is bounded by a stream, a partition, a window or a cutoff, and none of it is a filter
 * applied after the fact — the store answers the narrow question, because on this table the difference between
 * asking narrowly and filtering broadly is the difference between a query and an incident.
 *
 * `findByEventId` is how the mesh refuses to record the same event twice. A relay that retried after a timeout
 * it never saw the far side of will offer the same envelope again, and without this the stream would carry the
 * fact twice under two sequences — which every `at_least_once` consumer would faithfully process twice, and
 * which no `exactly_once` consumer could deduplicate, because the two copies are two genuinely different
 * messages by the time they reach one.
 *
 * `nextSequence` and `streamHead` are the two halves of a stream's position, and they are deliberately not the
 * same read. A sequence is per stream and gapless, so the next one is a fact about the whole stream; lag is per
 * partition, because a subscription reading eight partitions can be current on seven and stopped on the eighth,
 * and a head summed across them would report a healthy consumer with a dead one inside it.
 *
 * `countWindow` exists because the replay ceiling is enforced against it. {@link ReplayWindowRequest} takes the
 * count from the caller precisely so that the number is the store's rather than an estimate, and a ceiling
 * enforced against a guess is not a ceiling. `listWindow` is then the approved replay walking what it was
 * approved for, and it needs no limit argument because the count it was approved against was already held
 * below `MAX_REPLAY_MESSAGES` by the engine that approved it.
 *
 * `listRetaining` is the retention sweep's worklist: messages on one stream, recorded at or before a cutoff,
 * that still hold a body worth forgetting. Digest-only and payload-free streams never appear in it, and neither
 * does a message already forgotten, so a sweep run twice does the work once and raises the event once.
 */
export interface MeshMessageRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<MeshMessage | null>;
  findByEventId(tenantId: TenantId, eventId: Uuid): Promise<MeshMessage | null>;
  /** The sequence the next message on this stream takes. `FIRST_SEQUENCE` where nothing has been published. */
  nextSequence(tenantId: TenantId, streamKey: string): Promise<number>;
  /** The highest sequence on one partition. `UNCOMMITTED_POSITION` where nothing has been published to it. */
  streamHead(tenantId: TenantId, streamKey: string, partition: number): Promise<number>;
  countWindow(
    tenantId: TenantId,
    streamKey: string,
    fromInstant: ISODateString,
    toInstant: ISODateString,
  ): Promise<number>;
  listWindow(
    tenantId: TenantId,
    streamKey: string,
    fromInstant: ISODateString,
    toInstant: ISODateString,
  ): Promise<MeshMessage[]>;
  listRetaining(
    tenantId: TenantId,
    streamKey: string,
    recordedBefore: ISODateString,
  ): Promise<MeshMessage[]>;
  save(message: MeshMessage): Promise<void>;
}

/** In-memory {@link MeshMessageRepository} — the default for tests and bootstrap. */
export class InMemoryMeshMessageRepository implements MeshMessageRepository {
  private readonly byId = new Map<string, MeshMessage>();

  async findById(tenantId: TenantId, id: Uuid): Promise<MeshMessage | null> {
    const message = this.byId.get(id);
    return message && message.tenantId === tenantId ? message : null;
  }

  async findByEventId(tenantId: TenantId, eventId: Uuid): Promise<MeshMessage | null> {
    return (
      [...this.byId.values()].find((m) => m.tenantId === tenantId && m.eventId === eventId) ?? null
    );
  }

  async nextSequence(tenantId: TenantId, streamKey: string): Promise<number> {
    const sequences = [...this.byId.values()]
      .filter((m) => m.tenantId === tenantId && m.streamKey === streamKey)
      .map((m) => m.sequence);
    return sequences.length === 0 ? FIRST_SEQUENCE : Math.max(...sequences) + 1;
  }

  async streamHead(tenantId: TenantId, streamKey: string, partition: number): Promise<number> {
    const sequences = [...this.byId.values()]
      .filter(
        (m) => m.tenantId === tenantId && m.streamKey === streamKey && m.partition === partition,
      )
      .map((m) => m.sequence);
    return sequences.length === 0 ? UNCOMMITTED_POSITION : Math.max(...sequences);
  }

  async countWindow(
    tenantId: TenantId,
    streamKey: string,
    fromInstant: ISODateString,
    toInstant: ISODateString,
  ): Promise<number> {
    return [...this.byId.values()].filter(
      (m) =>
        m.tenantId === tenantId &&
        m.streamKey === streamKey &&
        withinWindow(m, fromInstant, toInstant),
    ).length;
  }

  async listWindow(
    tenantId: TenantId,
    streamKey: string,
    fromInstant: ISODateString,
    toInstant: ISODateString,
  ): Promise<MeshMessage[]> {
    return [...this.byId.values()]
      .filter(
        (m) =>
          m.tenantId === tenantId &&
          m.streamKey === streamKey &&
          withinWindow(m, fromInstant, toInstant),
      )
      .sort((left, right) => left.sequence - right.sequence);
  }

  async listRetaining(
    tenantId: TenantId,
    streamKey: string,
    recordedBefore: ISODateString,
  ): Promise<MeshMessage[]> {
    const cutoff = fixedWidthInstant(recordedBefore);
    return [...this.byId.values()]
      .filter(
        (m) =>
          m.tenantId === tenantId &&
          m.streamKey === streamKey &&
          isMeshMessageReplayable(m) &&
          fixedWidthInstant(m.recordedAt) <= cutoff,
      )
      .sort((left, right) => left.sequence - right.sequence);
  }

  async save(message: MeshMessage): Promise<void> {
    this.byId.set(message.id, message);
  }
}

// --- Checkpoints -----------------------------------------------------------------

/**
 * Storage contract for subscription checkpoints. Tenant-scoped (explicit argument + RLS).
 *
 * `findByPartition` backs the rule that one subscription holds one position on one partition. This is the
 * uniqueness the mesh cares most about, because the failure mode is not a duplicate row that somebody notices:
 * it is two positions on the same partition, a commit landing on whichever one was read, and a consumer that
 * appears to advance while quietly reprocessing whatever fell between them.
 *
 * `listBySubscription` is every position one consumer holds, which is the only honest shape for a lag report.
 * The bands are assessed per partition and the answer a consumer needs is per partition too — a subscription
 * summarised to a single number is a subscription whose one dead partition is averaged away by seven healthy
 * ones.
 *
 * Checkpoints are bounded by subscriptions times partitions, so this table is listable whole and
 * `listByTenant` is the operator's view across the estate.
 */
export interface SubscriptionCheckpointRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<SubscriptionCheckpoint | null>;
  findByPartition(
    tenantId: TenantId,
    subscriptionId: Uuid,
    partition: number,
  ): Promise<SubscriptionCheckpoint | null>;
  listBySubscription(tenantId: TenantId, subscriptionId: Uuid): Promise<SubscriptionCheckpoint[]>;
  listByTenant(tenantId: TenantId): Promise<SubscriptionCheckpoint[]>;
  save(checkpoint: SubscriptionCheckpoint): Promise<void>;
}

/** In-memory {@link SubscriptionCheckpointRepository} — the default for tests and bootstrap. */
export class InMemorySubscriptionCheckpointRepository implements SubscriptionCheckpointRepository {
  private readonly byId = new Map<string, SubscriptionCheckpoint>();

  async findById(tenantId: TenantId, id: Uuid): Promise<SubscriptionCheckpoint | null> {
    const checkpoint = this.byId.get(id);
    return checkpoint && checkpoint.tenantId === tenantId ? checkpoint : null;
  }

  async findByPartition(
    tenantId: TenantId,
    subscriptionId: Uuid,
    partition: number,
  ): Promise<SubscriptionCheckpoint | null> {
    return (
      [...this.byId.values()].find(
        (c) =>
          c.tenantId === tenantId &&
          c.subscriptionId === subscriptionId &&
          c.partition === partition,
      ) ?? null
    );
  }

  async listBySubscription(
    tenantId: TenantId,
    subscriptionId: Uuid,
  ): Promise<SubscriptionCheckpoint[]> {
    return [...this.byId.values()]
      .filter((c) => c.tenantId === tenantId && c.subscriptionId === subscriptionId)
      .sort((left, right) => left.partition - right.partition);
  }

  async listByTenant(tenantId: TenantId): Promise<SubscriptionCheckpoint[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId);
  }

  async save(checkpoint: SubscriptionCheckpoint): Promise<void> {
    this.byId.set(checkpoint.id, checkpoint);
  }
}

// --- Dead letters ----------------------------------------------------------------

/**
 * Storage contract for dead letters. Tenant-scoped (explicit argument + RLS).
 *
 * `findByMessage` backs the rule that one message dead-letters once per subscription. Without it a consumer
 * that keeps being restarted accumulates a dead letter per restart for the same failure, and the operator
 * opening the queue sees a thousand rows describing one broken projector rather than one row describing it a
 * thousand times over.
 *
 * `listOpen` is the worklist, and it is organization-wide because that is the shape the question is asked in:
 * the person who owns the morning check wants everything currently stuck across the school, not a subscription
 * at a time. Replayed and discarded letters are excluded here and kept forever below, because an open dead
 * letter is work and a settled one is evidence.
 *
 * `listBySubscription` is that evidence for one consumer, settled rows included. It is what answers *has this
 * been failing quietly for a month*, which a worklist filtered to open rows cannot, because somebody discarding
 * each failure as it arrives makes the queue look clean and the consumer look healthy.
 */
export interface DeadLetterRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<DeadLetter | null>;
  findByMessage(
    tenantId: TenantId,
    subscriptionId: Uuid,
    messageId: Uuid,
  ): Promise<DeadLetter | null>;
  listOpen(tenantId: TenantId, organizationId: Uuid): Promise<DeadLetter[]>;
  listBySubscription(tenantId: TenantId, subscriptionId: Uuid): Promise<DeadLetter[]>;
  listByTenant(tenantId: TenantId): Promise<DeadLetter[]>;
  save(letter: DeadLetter): Promise<void>;
}

/** In-memory {@link DeadLetterRepository} — the default for tests and bootstrap. */
export class InMemoryDeadLetterRepository implements DeadLetterRepository {
  private readonly byId = new Map<string, DeadLetter>();

  async findById(tenantId: TenantId, id: Uuid): Promise<DeadLetter | null> {
    const letter = this.byId.get(id);
    return letter && letter.tenantId === tenantId ? letter : null;
  }

  async findByMessage(
    tenantId: TenantId,
    subscriptionId: Uuid,
    messageId: Uuid,
  ): Promise<DeadLetter | null> {
    return (
      [...this.byId.values()].find(
        (l) =>
          l.tenantId === tenantId &&
          l.subscriptionId === subscriptionId &&
          l.messageId === messageId,
      ) ?? null
    );
  }

  async listOpen(tenantId: TenantId, organizationId: Uuid): Promise<DeadLetter[]> {
    return [...this.byId.values()]
      .filter(
        (l) =>
          l.tenantId === tenantId && l.organizationId === organizationId && isDeadLetterOpen(l),
      )
      .sort((left, right) => compareText(left.failedAt, right.failedAt));
  }

  async listBySubscription(tenantId: TenantId, subscriptionId: Uuid): Promise<DeadLetter[]> {
    return [...this.byId.values()]
      .filter((l) => l.tenantId === tenantId && l.subscriptionId === subscriptionId)
      .sort((left, right) => compareText(left.failedAt, right.failedAt));
  }

  async listByTenant(tenantId: TenantId): Promise<DeadLetter[]> {
    return [...this.byId.values()].filter((l) => l.tenantId === tenantId);
  }

  async save(letter: DeadLetter): Promise<void> {
    this.byId.set(letter.id, letter);
  }
}

// --- Replays ---------------------------------------------------------------------

/**
 * Storage contract for replay requests. Tenant-scoped (explicit argument + RLS).
 *
 * `findRunning` backs the rule that one subscription replays one window at a time. Two concurrent replays into
 * the same consumer group interleave two ranges of history in an order neither requester asked for, and the
 * consumer on the far side — which was written to read a stream forwards — has no way to tell that it is being
 * handed two. Refusing the second replay is the only place that can be prevented, and this is the read that
 * lets it be refused.
 *
 * `listBySubscription` is the replay history of one consumer, and it is the answer to the question a replay
 * always eventually raises: *why does this projection show the same enrolment twice*. A settled replay is the
 * record that somebody asked for a range of history to be delivered again, who approved it, and how much
 * actually went — and without the history in one place that investigation starts by asking people what they
 * remember doing.
 */
export interface ReplayRequestRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<ReplayRequest | null>;
  findRunning(tenantId: TenantId, subscriptionId: Uuid): Promise<ReplayRequest | null>;
  listBySubscription(tenantId: TenantId, subscriptionId: Uuid): Promise<ReplayRequest[]>;
  listByTenant(tenantId: TenantId): Promise<ReplayRequest[]>;
  save(request: ReplayRequest): Promise<void>;
}

/** In-memory {@link ReplayRequestRepository} — the default for tests and bootstrap. */
export class InMemoryReplayRequestRepository implements ReplayRequestRepository {
  private readonly byId = new Map<string, ReplayRequest>();

  async findById(tenantId: TenantId, id: Uuid): Promise<ReplayRequest | null> {
    const request = this.byId.get(id);
    return request && request.tenantId === tenantId ? request : null;
  }

  async findRunning(tenantId: TenantId, subscriptionId: Uuid): Promise<ReplayRequest | null> {
    return (
      [...this.byId.values()].find(
        (r) => r.tenantId === tenantId && r.subscriptionId === subscriptionId && isReplayRunning(r),
      ) ?? null
    );
  }

  async listBySubscription(tenantId: TenantId, subscriptionId: Uuid): Promise<ReplayRequest[]> {
    return [...this.byId.values()]
      .filter((r) => r.tenantId === tenantId && r.subscriptionId === subscriptionId)
      .sort((left, right) => compareText(left.createdAt, right.createdAt));
  }

  async listByTenant(tenantId: TenantId): Promise<ReplayRequest[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(request: ReplayRequest): Promise<void> {
    this.byId.set(request.id, request);
  }
}
