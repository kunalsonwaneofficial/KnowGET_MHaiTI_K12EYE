import { createEvent } from "@knowget/events";
import type { DomainEvent, ISODateString, Uuid } from "@knowget/types";
import { type DeadLetter, isDeadLetterOpen, isDeadLetterRetriable } from "./dead-letter";
import { type EventStream, isEventStreamPublishable } from "./event-stream";
import {
  type EventTypeDefinition,
  isEventTypeCarried,
  isEventTypeSchemaFrozen,
} from "./event-type-definition";
import { type MeshMessage, isMeshMessageReplayable } from "./mesh-message";
import {
  type MeshSubscription,
  isMeshSubscriptionDeliverable,
  subscriptionRequiresDeduplication,
  subscriptionRequiresRetry,
} from "./mesh-subscription";
import type {
  BindingStatus,
  CompatibilityMode,
  DeadLetterReason,
  DeadLetterStatus,
  DeliverySemantics,
  EventTypeStatus,
  OrderingGuarantee,
  PayloadRetention,
  ReplayStatus,
  StreamStatus,
  SubscriptionStatus,
  TransportKind,
  TransportRefProvider,
} from "./mesh-value";
import {
  type ReplayRequest,
  isReplayRunning,
  isReplaySettled,
  replayNeedsApproval,
} from "./replay-request";
import {
  type StreamBinding,
  bindingTransportProvider,
  isStreamBindingCarrying,
  isStreamBindingDraining,
} from "./stream-binding";
import { type SubscriptionCheckpoint, hasCheckpointCommitted } from "./subscription-checkpoint";

/**
 * Domain events for the event mesh, streaming and messaging contract (P3-D02), on the `mesh.*` namespace.
 *
 * Payloads carry identifiers, registry keys, schema versions, partitions, sequences, statuses, reason codes
 * and counts. Four categories of field are held back, and each exclusion is one clause of this package's own
 * contract read in a different place. The irony this file has to live with is that it publishes onto the very
 * bus it governs, which means every rule the mesh imposes on other publishers applies here first.
 *
 * **No payload and no digest ever travels.** A recorded message may hold the body of the fact it carried, and
 * nothing in this file will put that body — or the digest of it — on a channel. The reason is not that a mesh
 * event is an unlikely place to leak one; it is that the mesh is the single surface in the platform through
 * which every institutional fact passes, so a payload published here is a payload published about admissions,
 * safeguarding, health, payroll and discipline at once. A digest is not the body, but it is a perfect oracle
 * for guesses about a body, and an event payload with a handful of low-cardinality fields is enumerable by
 * anybody holding its digest and an afternoon. What a forgetting event carries is that a body is gone.
 *
 * **No transport reference ever travels.** A binding holds a handle such as `config:mesh.kafka.primary`, and
 * the aggregate is careful to refuse the connection settings themselves. That care is worth nothing if the
 * handle is then broadcast, because a handle is an address in a configuration or custody store and an address
 * published to every subscriber is an invitation to go and read it. Binding events carry the *provider* the
 * handle resolves through, which is the field an operator actually triages on — a binding pointing at a vault
 * has a different failure mode from one pointing at an environment variable — and nothing more.
 *
 * **No filter value ever travels.** A subscription's filter is a list of predicates over envelope attributes,
 * and a predicate's values are the specific event types, producers and aggregate kinds one consumer cares
 * about. Published together those values are a map of who watches what, which is a description of the
 * institution's internal interest in its own people, assembled on a channel designed to be subscribed to
 * widely. A count is enough to see the shape of a change — two predicates became nine is a question worth
 * asking — and is not that map.
 *
 * **No free text travels.** Titles and summaries, a discard's justification, a replay's reason, a settlement's
 * account of what stopped and a checkpoint reset's explanation all stay in the tenant's records. Three of
 * those are more than tidiness. A discard reason is somebody's written argument for why losing an
 * institutional fact permanently was acceptable; a replay reason routinely names the incident, the family or
 * the reconciliation that motivated it; and a reset reason is written in the middle of an outage by somebody
 * with no expectation that it is about to be fanned out. The events say that each happened, and who by.
 *
 * **Nothing here is a command, and the two highest-volume operations publish nothing at all.** Recording a
 * message and committing a checkpoint are what this package does millions of times a day, and neither raises
 * anything: a per-message event on the publication path is a metrics pipeline wearing a bus's clothes, and a
 * per-commit event would be a mesh publishing its own progress through itself. The platform already has
 * metrics and observability contracts shaped for that traffic. Editing a `draft` event type raises nothing
 * either, for a quieter reason — a draft is not carried, so nobody downstream can act on a change to one, and
 * an event nobody can act on is noise with a schema. What routes here is that something's standing changed.
 */

// --- Event types -----------------------------------------------------------------
export const EVENT_TYPE_DEFINED = "mesh.event-type.defined";
export const EVENT_TYPE_PUBLISHED = "mesh.event-type.published";
export const EVENT_TYPE_DEPRECATED = "mesh.event-type.deprecated";
export const EVENT_TYPE_RETIRED = "mesh.event-type.retired";

export interface EventTypeEventPayload {
  readonly eventTypeId: Uuid;
  readonly organizationId: Uuid;
  /** The registered type, e.g. `admissions.application.submitted`. The vocabulary is meant to be public. */
  readonly eventTypeKey: string;
  /** The major version a consumer pins to. Carried everywhere, because a key alone pins to nothing. */
  readonly version: number;
  /** The promise made to readers across versions. What a subscriber decides whether to trust the key on. */
  readonly compatibilityMode: CompatibilityMode;
  readonly status: EventTypeStatus;
  /**
   * How many fields the payload schema declares. The schema itself is read within the tenant, deliberately.
   *
   * A count is enough to see that a shape moved, and a consumer that needs the shape is a consumer that has
   * to fetch and pin a version anyway. The field list would be a description of what the institution records
   * about its people, published on a channel whose whole purpose is breadth of subscription.
   */
  readonly schemaFieldCount: number;
  /** Whether the mesh still carries this version: published, or deprecated and inside its notice. */
  readonly carried: boolean;
  /** Whether the schema can still be edited. False from publication onwards, which is the promise. */
  readonly schemaFrozen: boolean;
  readonly publishedAt: ISODateString | null;
  /** When this version stops being carried. The single field a consumer team plans work around. */
  readonly retireAt: ISODateString | null;
  /** The version to move to, named with the deprecation so that the notice is actionable. */
  readonly supersededByVersion: number | null;
}

const eventTypePayload = (definition: EventTypeDefinition): EventTypeEventPayload => ({
  eventTypeId: definition.id,
  organizationId: definition.organizationId,
  eventTypeKey: definition.eventTypeKey,
  version: definition.version,
  compatibilityMode: definition.compatibilityMode,
  status: definition.status,
  schemaFieldCount: definition.schemaFields.length,
  carried: isEventTypeCarried(definition),
  schemaFrozen: isEventTypeSchemaFrozen(definition),
  publishedAt: definition.publishedAt,
  retireAt: definition.retireAt,
  supersededByVersion: definition.supersededByVersion,
});

export type EventTypeDefinedEvent = DomainEvent<typeof EVENT_TYPE_DEFINED, EventTypeEventPayload>;
export type EventTypePublishedEvent = DomainEvent<
  typeof EVENT_TYPE_PUBLISHED,
  EventTypeEventPayload
>;
export type EventTypeDeprecatedEvent = DomainEvent<
  typeof EVENT_TYPE_DEPRECATED,
  EventTypeEventPayload
>;
export type EventTypeRetiredEvent = DomainEvent<typeof EVENT_TYPE_RETIRED, EventTypeEventPayload>;

/** A type exists in the registry, as a draft nothing is carried under yet. */
export const eventTypeDefined = (definition: EventTypeDefinition): EventTypeDefinedEvent =>
  createEvent(EVENT_TYPE_DEFINED, eventTypePayload(definition), { tenantId: definition.tenantId });

/**
 * The shape is now frozen and the mesh will carry it. The event a producer has been waiting for.
 *
 * This is the one publication in the section that unblocks work elsewhere. Until it fires, a capability that
 * wants to emit the type has nothing to emit it under, and a consumer that wants to pin has nothing to pin
 * to. Everything after it is notice of an ending.
 */
export const eventTypePublished = (definition: EventTypeDefinition): EventTypePublishedEvent =>
  createEvent(EVENT_TYPE_PUBLISHED, eventTypePayload(definition), {
    tenantId: definition.tenantId,
  });

/**
 * Notice was given that a version will stop being carried, with the date and the successor.
 *
 * The most useful event in the file for anybody who does not work on the mesh. A deprecation is the platform
 * telling every team consuming a shape that they have until `retireAt` to move, and the notice is worth
 * having on a bus precisely because the teams who need it are not the teams watching the registry.
 */
export const eventTypeDeprecated = (definition: EventTypeDefinition): EventTypeDeprecatedEvent =>
  createEvent(EVENT_TYPE_DEPRECATED, eventTypePayload(definition), {
    tenantId: definition.tenantId,
  });

/** The version is no longer carried. Anything still publishing it is now being refused. */
export const eventTypeRetired = (definition: EventTypeDefinition): EventTypeRetiredEvent =>
  createEvent(EVENT_TYPE_RETIRED, eventTypePayload(definition), { tenantId: definition.tenantId });

// --- Streams ---------------------------------------------------------------------
export const STREAM_DEFINED = "mesh.stream.defined";
export const STREAM_REPARTITIONED = "mesh.stream.repartitioned";
export const STREAM_RETENTION_REVISED = "mesh.stream.retention-revised";
export const STREAM_ACTIVATED = "mesh.stream.activated";
export const STREAM_PAUSED = "mesh.stream.paused";
export const STREAM_RETIRED = "mesh.stream.retired";
export const STREAM_EVENT_TYPE_ACCEPTED = "mesh.stream.event-type-accepted";
export const STREAM_EVENT_TYPE_WITHDRAWN = "mesh.stream.event-type-withdrawn";

export interface EventStreamEventPayload {
  readonly streamId: Uuid;
  readonly organizationId: Uuid;
  readonly streamKey: string;
  readonly status: StreamStatus;
  /** What the stream promises about order. Half of what a consumer's own correctness rests on. */
  readonly ordering: OrderingGuarantee;
  /** And the other half: partition 3 of 8 and partition 3 of 64 are different places. */
  readonly partitionCount: number;
  /** What the stream keeps of what it carried. What decides whether a replay is even arguable. */
  readonly retention: PayloadRetention;
  readonly retentionSeconds: number;
  /** How many types the stream accepts. The list is on the record, and two of its members are below. */
  readonly eventTypeCount: number;
  /** Whether the stream will carry anything at all right now. */
  readonly publishable: boolean;
  readonly activatedAt: ISODateString | null;
}

const streamPayload = (stream: EventStream): EventStreamEventPayload => ({
  streamId: stream.id,
  organizationId: stream.organizationId,
  streamKey: stream.streamKey,
  status: stream.status,
  ordering: stream.ordering,
  partitionCount: stream.partitionCount,
  retention: stream.retention,
  retentionSeconds: stream.retentionSeconds,
  eventTypeCount: stream.eventTypeKeys.length,
  publishable: isEventStreamPublishable(stream),
  activatedAt: stream.activatedAt,
});

/**
 * A stream's accepted vocabulary moved, and by which member.
 *
 * The one place a payload in this file names an individual event type alongside a stream, and it is carried
 * because the type key is this package's own published vocabulary rather than anybody's data — the same
 * string that appears in the registry, in the documentation and in every producer's source. A withdrawal in
 * particular is the platform telling a producer that its next publication will be refused, and an event that
 * said only *the vocabulary changed* would leave every producer on the stream to go and diff the list.
 */
export interface StreamVocabularyEventPayload {
  readonly streamId: Uuid;
  readonly organizationId: Uuid;
  readonly streamKey: string;
  readonly status: StreamStatus;
  /** The type accepted or withdrawn. This package's own vocabulary, not a value out of anybody's payload. */
  readonly eventTypeKey: string;
  readonly eventTypeCount: number;
}

const streamVocabularyPayload = (
  stream: EventStream,
  eventTypeKey: string,
): StreamVocabularyEventPayload => ({
  streamId: stream.id,
  organizationId: stream.organizationId,
  streamKey: stream.streamKey,
  status: stream.status,
  eventTypeKey,
  eventTypeCount: stream.eventTypeKeys.length,
});

export type StreamDefinedEvent = DomainEvent<typeof STREAM_DEFINED, EventStreamEventPayload>;
export type StreamRepartitionedEvent = DomainEvent<
  typeof STREAM_REPARTITIONED,
  EventStreamEventPayload
>;
export type StreamRetentionRevisedEvent = DomainEvent<
  typeof STREAM_RETENTION_REVISED,
  EventStreamEventPayload
>;
export type StreamActivatedEvent = DomainEvent<typeof STREAM_ACTIVATED, EventStreamEventPayload>;
export type StreamPausedEvent = DomainEvent<typeof STREAM_PAUSED, EventStreamEventPayload>;
export type StreamRetiredEvent = DomainEvent<typeof STREAM_RETIRED, EventStreamEventPayload>;
export type StreamEventTypeAcceptedEvent = DomainEvent<
  typeof STREAM_EVENT_TYPE_ACCEPTED,
  StreamVocabularyEventPayload
>;
export type StreamEventTypeWithdrawnEvent = DomainEvent<
  typeof STREAM_EVENT_TYPE_WITHDRAWN,
  StreamVocabularyEventPayload
>;

/** A channel exists, as a draft carrying nothing. */
export const streamDefined = (stream: EventStream): StreamDefinedEvent =>
  createEvent(STREAM_DEFINED, streamPayload(stream), { tenantId: stream.tenantId });

/**
 * The ordering promise or the partition arithmetic moved underneath everything already published.
 *
 * The event in this file with the shortest fuse. Re-mapping keys onto a different number of partitions
 * leaves every message already carried exactly where it was, so a consumer that had been reading one
 * learner's facts in order begins finding some of them in a partition it has already passed. A consumer that
 * hears this and does nothing is a consumer whose ordering guarantee quietly stopped being true.
 */
export const streamRepartitioned = (stream: EventStream): StreamRepartitionedEvent =>
  createEvent(STREAM_REPARTITIONED, streamPayload(stream), { tenantId: stream.tenantId });

/**
 * What the stream keeps, and for how long, changed. The bound on every future replay moved with it.
 *
 * Worth its own event rather than folding into a general revision, because retention is the one setting on a
 * stream that decides whether a question can be answered at all later. A narrowing is a decision to stop
 * being able to reconstruct something, and the teams who would have asked should hear about it before they
 * ask.
 */
export const streamRetentionRevised = (stream: EventStream): StreamRetentionRevisedEvent =>
  createEvent(STREAM_RETENTION_REVISED, streamPayload(stream), { tenantId: stream.tenantId });

export const streamActivated = (stream: EventStream): StreamActivatedEvent =>
  createEvent(STREAM_ACTIVATED, streamPayload(stream), { tenantId: stream.tenantId });

/** Publication is refused from here until it is resumed. Consumers keep draining what is already there. */
export const streamPaused = (stream: EventStream): StreamPausedEvent =>
  createEvent(STREAM_PAUSED, streamPayload(stream), { tenantId: stream.tenantId });

export const streamRetired = (stream: EventStream): StreamRetiredEvent =>
  createEvent(STREAM_RETIRED, streamPayload(stream), { tenantId: stream.tenantId });

/** The stream will now carry this type. A producer holding it can start publishing. */
export const streamEventTypeAccepted = (
  stream: EventStream,
  eventTypeKey: string,
): StreamEventTypeAcceptedEvent =>
  createEvent(STREAM_EVENT_TYPE_ACCEPTED, streamVocabularyPayload(stream, eventTypeKey), {
    tenantId: stream.tenantId,
  });

/** The stream will refuse this type from here. A producer still holding it is about to find out. */
export const streamEventTypeWithdrawn = (
  stream: EventStream,
  eventTypeKey: string,
): StreamEventTypeWithdrawnEvent =>
  createEvent(STREAM_EVENT_TYPE_WITHDRAWN, streamVocabularyPayload(stream, eventTypeKey), {
    tenantId: stream.tenantId,
  });

// --- Stream bindings -------------------------------------------------------------
export const BINDING_DECLARED = "mesh.binding.declared";
export const BINDING_RETARGETED = "mesh.binding.retargeted";
export const BINDING_ACTIVATED = "mesh.binding.activated";
export const BINDING_DRAINING = "mesh.binding.draining";
export const BINDING_RETIRED = "mesh.binding.retired";

export interface StreamBindingEventPayload {
  readonly bindingId: Uuid;
  readonly organizationId: Uuid;
  readonly streamKey: string;
  /** Which backbone the stream travels on. Immutable, and the first thing an incident asks about. */
  readonly transport: TransportKind;
  /**
   * Which provider the transport's settings resolve through. Never the handle, and never the settings.
   *
   * The useful half of the reference and the half that is not an address. A binding resolving through a
   * vault and one resolving through an environment variable fail differently, are rotated differently and
   * are audited differently, and that is the whole of what a subscriber outside the mesh can act on.
   */
  readonly transportRefProvider: TransportRefProvider;
  readonly status: BindingStatus;
  /** Whether it is carrying right now. */
  readonly carrying: boolean;
  /** Whether it has stopped accepting and is catching its consumers up. */
  readonly draining: boolean;
  readonly activatedAt: ISODateString | null;
}

const bindingPayload = (binding: StreamBinding): StreamBindingEventPayload => ({
  bindingId: binding.id,
  organizationId: binding.organizationId,
  streamKey: binding.streamKey,
  transport: binding.transport,
  transportRefProvider: bindingTransportProvider(binding),
  status: binding.status,
  carrying: isStreamBindingCarrying(binding),
  draining: isStreamBindingDraining(binding),
  activatedAt: binding.activatedAt,
});

export type BindingDeclaredEvent = DomainEvent<typeof BINDING_DECLARED, StreamBindingEventPayload>;
export type BindingRetargetedEvent = DomainEvent<
  typeof BINDING_RETARGETED,
  StreamBindingEventPayload
>;
export type BindingActivatedEvent = DomainEvent<
  typeof BINDING_ACTIVATED,
  StreamBindingEventPayload
>;
export type BindingDrainingEvent = DomainEvent<typeof BINDING_DRAINING, StreamBindingEventPayload>;
export type BindingRetiredEvent = DomainEvent<typeof BINDING_RETIRED, StreamBindingEventPayload>;

export const bindingDeclared = (binding: StreamBinding): BindingDeclaredEvent =>
  createEvent(BINDING_DECLARED, bindingPayload(binding), { tenantId: binding.tenantId });

/**
 * The handle behind the binding was replaced. The handle is not here, and that is the point.
 *
 * A retarget is how a broker credential is rotated without a stream ever stopping, so it fires on a binding
 * that is actively carrying institutional facts. Everything a subscriber needs is in the provider and the
 * instant; the value that changed is exactly the thing that must not be on a bus.
 */
export const bindingRetargeted = (binding: StreamBinding): BindingRetargetedEvent =>
  createEvent(BINDING_RETARGETED, bindingPayload(binding), { tenantId: binding.tenantId });

export const bindingActivated = (binding: StreamBinding): BindingActivatedEvent =>
  createEvent(BINDING_ACTIVATED, bindingPayload(binding), { tenantId: binding.tenantId });

/** The binding stopped accepting and is catching its consumers up. A swap has begun. */
export const bindingDraining = (binding: StreamBinding): BindingDrainingEvent =>
  createEvent(BINDING_DRAINING, bindingPayload(binding), { tenantId: binding.tenantId });

export const bindingRetired = (binding: StreamBinding): BindingRetiredEvent =>
  createEvent(BINDING_RETIRED, bindingPayload(binding), { tenantId: binding.tenantId });

// --- Subscriptions ---------------------------------------------------------------
export const SUBSCRIPTION_REGISTERED = "mesh.subscription.registered";
export const SUBSCRIPTION_REFILTERED = "mesh.subscription.refiltered";
export const SUBSCRIPTION_DELIVERY_REVISED = "mesh.subscription.delivery-revised";
export const SUBSCRIPTION_ACTIVATED = "mesh.subscription.activated";
export const SUBSCRIPTION_PAUSED = "mesh.subscription.paused";
export const SUBSCRIPTION_RETIRED = "mesh.subscription.retired";

export interface MeshSubscriptionEventPayload {
  readonly subscriptionId: Uuid;
  readonly organizationId: Uuid;
  readonly subscriptionKey: string;
  readonly streamKey: string;
  /** The group the checkpoint is filed under. What ties this subscription to a position on the stream. */
  readonly consumerGroup: string;
  /** What the mesh promises about delivery count. A commitment, so it is carried where it changes. */
  readonly semantics: DeliverySemantics;
  readonly maxAttempts: number;
  /**
   * How many predicates the filter holds. The predicates themselves are read within the tenant.
   *
   * A count shows an interest widening or narrowing, which is what an operator reacts to when a
   * subscription's volume changes overnight. The values would be a list of the event types, producers and
   * aggregate kinds one team watches, and a bus full of those lists is a map of the institution's internal
   * attention that nobody agreed to publish.
   */
  readonly filterPredicateCount: number;
  readonly status: SubscriptionStatus;
  /** Whether it is receiving right now. */
  readonly deliverable: boolean;
  /** Whether the promise obliges the mesh to keep a deduplication ledger for it. */
  readonly deduplicated: boolean;
  /** Whether the promise obliges the mesh to retry for it. */
  readonly retried: boolean;
  readonly activatedAt: ISODateString | null;
}

const subscriptionPayload = (subscription: MeshSubscription): MeshSubscriptionEventPayload => ({
  subscriptionId: subscription.id,
  organizationId: subscription.organizationId,
  subscriptionKey: subscription.subscriptionKey,
  streamKey: subscription.streamKey,
  consumerGroup: subscription.consumerGroup,
  semantics: subscription.semantics,
  maxAttempts: subscription.maxAttempts,
  filterPredicateCount: subscription.filter.length,
  status: subscription.status,
  deliverable: isMeshSubscriptionDeliverable(subscription),
  deduplicated: subscriptionRequiresDeduplication(subscription),
  retried: subscriptionRequiresRetry(subscription),
  activatedAt: subscription.activatedAt,
});

export type SubscriptionRegisteredEvent = DomainEvent<
  typeof SUBSCRIPTION_REGISTERED,
  MeshSubscriptionEventPayload
>;
export type SubscriptionRefilteredEvent = DomainEvent<
  typeof SUBSCRIPTION_REFILTERED,
  MeshSubscriptionEventPayload
>;
export type SubscriptionDeliveryRevisedEvent = DomainEvent<
  typeof SUBSCRIPTION_DELIVERY_REVISED,
  MeshSubscriptionEventPayload
>;
export type SubscriptionActivatedEvent = DomainEvent<
  typeof SUBSCRIPTION_ACTIVATED,
  MeshSubscriptionEventPayload
>;
export type SubscriptionPausedEvent = DomainEvent<
  typeof SUBSCRIPTION_PAUSED,
  MeshSubscriptionEventPayload
>;
export type SubscriptionRetiredEvent = DomainEvent<
  typeof SUBSCRIPTION_RETIRED,
  MeshSubscriptionEventPayload
>;

/** A consumer exists on paper, receiving nothing until somebody activates it. */
export const subscriptionRegistered = (
  subscription: MeshSubscription,
): SubscriptionRegisteredEvent =>
  createEvent(SUBSCRIPTION_REGISTERED, subscriptionPayload(subscription), {
    tenantId: subscription.tenantId,
  });

/**
 * What the subscription wants changed, in one direction or the other.
 *
 * One event for widening and narrowing rather than two, because the only honest question either provokes is
 * *what does this consumer receive now*, and the answer is the same field in both cases. A subscriber that
 * genuinely reacts differently is comparing counts across two events it received anyway.
 */
export const subscriptionRefiltered = (
  subscription: MeshSubscription,
): SubscriptionRefilteredEvent =>
  createEvent(SUBSCRIPTION_REFILTERED, subscriptionPayload(subscription), {
    tenantId: subscription.tenantId,
  });

/** The delivery promise or the attempt ceiling moved. Both change what failure looks like downstream. */
export const subscriptionDeliveryRevised = (
  subscription: MeshSubscription,
): SubscriptionDeliveryRevisedEvent =>
  createEvent(SUBSCRIPTION_DELIVERY_REVISED, subscriptionPayload(subscription), {
    tenantId: subscription.tenantId,
  });

export const subscriptionActivated = (subscription: MeshSubscription): SubscriptionActivatedEvent =>
  createEvent(SUBSCRIPTION_ACTIVATED, subscriptionPayload(subscription), {
    tenantId: subscription.tenantId,
  });

/**
 * The subscription stopped receiving, and a backlog began accruing behind it.
 *
 * The event an operations team most wants on a bus. A pause is safe and routine during a deployment and
 * catastrophic when it is forgotten, and the difference between the two is entirely whether anybody noticed
 * it was still paused an hour later.
 */
export const subscriptionPaused = (subscription: MeshSubscription): SubscriptionPausedEvent =>
  createEvent(SUBSCRIPTION_PAUSED, subscriptionPayload(subscription), {
    tenantId: subscription.tenantId,
  });

export const subscriptionRetired = (subscription: MeshSubscription): SubscriptionRetiredEvent =>
  createEvent(SUBSCRIPTION_RETIRED, subscriptionPayload(subscription), {
    tenantId: subscription.tenantId,
  });

// --- Messages --------------------------------------------------------------------
export const MESSAGE_PAYLOAD_FORGOTTEN = "mesh.message.payload-forgotten";

export interface MessagePayloadForgottenEventPayload {
  readonly messageId: Uuid;
  readonly organizationId: Uuid;
  readonly streamKey: string;
  readonly partition: number;
  readonly sequence: number;
  /** The id every other capability in the platform knows the underlying fact by. */
  readonly eventId: Uuid;
  readonly eventTypeKey: string;
  readonly eventTypeVersion: number;
  /** What the stream declared it keeps. Context for why the body was ever there to forget. */
  readonly retention: PayloadRetention;
  /** Whether the message can still be replayed with a body. False from here, which is the whole point. */
  readonly replayable: boolean;
  /** When the body was dropped. Non-null on every instance of this event, by construction. */
  readonly forgottenAt: ISODateString | null;
}

const messagePayloadForgottenPayload = (
  message: MeshMessage,
): MessagePayloadForgottenEventPayload => ({
  messageId: message.id,
  organizationId: message.organizationId,
  streamKey: message.streamKey,
  partition: message.partition,
  sequence: message.sequence,
  eventId: message.eventId,
  eventTypeKey: message.eventTypeKey,
  eventTypeVersion: message.eventTypeVersion,
  retention: message.retention,
  replayable: isMeshMessageReplayable(message),
  forgottenAt: message.payloadForgottenAt,
});

export type MessagePayloadForgottenEvent = DomainEvent<
  typeof MESSAGE_PAYLOAD_FORGOTTEN,
  MessagePayloadForgottenEventPayload
>;

/**
 * A recorded message's body was dropped, by retention or by erasure. The record of the fact remains.
 *
 * The only event this section raises, and the contrast with what it does not raise is the argument for it.
 * Recording a message is the highest-volume operation in the package and publishes nothing; forgetting a
 * body happens once per message at most, is irreversible, and is the event a compliance capability needs in
 * order to show that an erasure actually reached the mesh rather than stopping at the system of record.
 *
 * The body is not here. Neither is the digest. What is here is that the message exists, where it sits, what
 * it was, and that it can no longer be replayed with a body — which is precisely the set of facts somebody
 * proving an erasure has to be able to point at.
 */
export const messagePayloadForgotten = (message: MeshMessage): MessagePayloadForgottenEvent =>
  createEvent(MESSAGE_PAYLOAD_FORGOTTEN, messagePayloadForgottenPayload(message), {
    tenantId: message.tenantId,
  });

// --- Checkpoints -----------------------------------------------------------------
export const CHECKPOINT_RESET = "mesh.checkpoint.reset";

export interface CheckpointResetEventPayload {
  readonly checkpointId: Uuid;
  readonly organizationId: Uuid;
  readonly subscriptionId: Uuid;
  readonly subscriptionKey: string;
  readonly streamKey: string;
  readonly partition: number;
  /** Where the position now stands, after the move. */
  readonly committedPosition: number;
  /** Whether the consumer has confirmed anything at all from here. False on a reset to the beginning. */
  readonly committed: boolean;
  readonly resetAt: ISODateString | null;
  /** Who moved it. The reason they gave stays on the record, deliberately. */
  readonly resetBy: Uuid | null;
}

const checkpointResetPayload = (
  checkpoint: SubscriptionCheckpoint,
): CheckpointResetEventPayload => ({
  checkpointId: checkpoint.id,
  organizationId: checkpoint.organizationId,
  subscriptionId: checkpoint.subscriptionId,
  subscriptionKey: checkpoint.subscriptionKey,
  streamKey: checkpoint.streamKey,
  partition: checkpoint.partition,
  committedPosition: checkpoint.committedPosition,
  committed: hasCheckpointCommitted(checkpoint),
  resetAt: checkpoint.resetAt,
  resetBy: checkpoint.resetBy,
});

export type CheckpointResetEvent = DomainEvent<
  typeof CHECKPOINT_RESET,
  CheckpointResetEventPayload
>;

/**
 * A position was moved by hand rather than by a consumer. The one checkpoint operation that publishes.
 *
 * Committing a position is the second highest-volume thing this package does and raises nothing. Resetting
 * one is rare, deliberate, and the single operation in the mesh that can cause a month of institutional
 * facts to be processed a second time or skipped entirely. The teams downstream of that consumer are the
 * people who will see the consequences and the last people to be told, unless this fires.
 */
export const checkpointReset = (checkpoint: SubscriptionCheckpoint): CheckpointResetEvent =>
  createEvent(CHECKPOINT_RESET, checkpointResetPayload(checkpoint), {
    tenantId: checkpoint.tenantId,
  });

// --- Dead letters ----------------------------------------------------------------
export const DEAD_LETTER_RECORDED = "mesh.dead-letter.recorded";
export const DEAD_LETTER_REPLAYED = "mesh.dead-letter.replayed";
export const DEAD_LETTER_DISCARDED = "mesh.dead-letter.discarded";

export interface DeadLetterEventPayload {
  readonly deadLetterId: Uuid;
  readonly organizationId: Uuid;
  readonly subscriptionId: Uuid;
  readonly subscriptionKey: string;
  readonly streamKey: string;
  /** The recorded message this is about, which is what a replay of it would send again. */
  readonly messageId: Uuid;
  readonly eventId: Uuid;
  readonly eventTypeKey: string;
  /** Where on the stream it sat. Carried because a partition failing wholesale is a different fault. */
  readonly partition: number;
  readonly sequence: number;
  /** Why the mesh gave up, from a closed set. The first thing anybody groups a dead-letter queue by. */
  readonly reason: DeadLetterReason;
  readonly attempts: number;
  readonly status: DeadLetterStatus;
  /** Whether anybody has decided what to do about it yet. */
  readonly open: boolean;
  /** Whether the reason is one a retry could plausibly fix, as opposed to one that needs a change. */
  readonly retriable: boolean;
  readonly failedAt: ISODateString;
  /** The replay that sent it again, where one did. Null on an open or discarded record. */
  readonly replayId: Uuid | null;
}

const deadLetterPayload = (letter: DeadLetter): DeadLetterEventPayload => ({
  deadLetterId: letter.id,
  organizationId: letter.organizationId,
  subscriptionId: letter.subscriptionId,
  subscriptionKey: letter.subscriptionKey,
  streamKey: letter.streamKey,
  messageId: letter.messageId,
  eventId: letter.eventId,
  eventTypeKey: letter.eventTypeKey,
  partition: letter.partition,
  sequence: letter.sequence,
  reason: letter.reason,
  attempts: letter.attempts,
  status: letter.status,
  open: isDeadLetterOpen(letter),
  retriable: isDeadLetterRetriable(letter),
  failedAt: letter.failedAt,
  replayId: letter.replayId,
});

export type DeadLetterRecordedEvent = DomainEvent<
  typeof DEAD_LETTER_RECORDED,
  DeadLetterEventPayload
>;
export type DeadLetterReplayedEvent = DomainEvent<
  typeof DEAD_LETTER_REPLAYED,
  DeadLetterEventPayload
>;
export type DeadLetterDiscardedEvent = DomainEvent<
  typeof DEAD_LETTER_DISCARDED,
  DeadLetterEventPayload
>;

/**
 * The mesh gave up delivering one fact to one consumer. Somebody now has to decide what happens to it.
 *
 * A dead letter is an institutional fact that did not reach the thing that was supposed to act on it: an
 * enrolment the ledger never saw, a safeguarding note the pastoral projector never indexed. The trace id
 * stays on the record rather than travelling, because it is a handle into a log store and a subscriber that
 * needs it holds the dead-letter id to go and read one.
 */
export const deadLetterRecorded = (letter: DeadLetter): DeadLetterRecordedEvent =>
  createEvent(DEAD_LETTER_RECORDED, deadLetterPayload(letter), { tenantId: letter.tenantId });

/** Somebody sent it again, under a replay that is now accountable for whether it lands. */
export const deadLetterReplayed = (letter: DeadLetter): DeadLetterReplayedEvent =>
  createEvent(DEAD_LETTER_REPLAYED, deadLetterPayload(letter), { tenantId: letter.tenantId });

/**
 * Somebody decided the fact would never be processed. The justification stays in the tenant's records.
 *
 * The most consequential settlement in the package: a discard is a deliberate, permanent decision to lose
 * something the institution recorded. The event carries who, what and which reason code, and leaves the
 * written argument where an auditor reads it rather than where a subscriber does.
 */
export const deadLetterDiscarded = (letter: DeadLetter): DeadLetterDiscardedEvent =>
  createEvent(DEAD_LETTER_DISCARDED, deadLetterPayload(letter), { tenantId: letter.tenantId });

// --- Replays ---------------------------------------------------------------------
export const REPLAY_REQUESTED = "mesh.replay.requested";
export const REPLAY_APPROVED = "mesh.replay.approved";
export const REPLAY_REJECTED = "mesh.replay.rejected";
export const REPLAY_STARTED = "mesh.replay.started";
export const REPLAY_COMPLETED = "mesh.replay.completed";
export const REPLAY_FAILED = "mesh.replay.failed";
export const REPLAY_CANCELLED = "mesh.replay.cancelled";

export interface ReplayRequestEventPayload {
  readonly replayId: Uuid;
  readonly organizationId: Uuid;
  readonly subscriptionId: Uuid;
  /** The one consumer the window will be sent to. A replay is never a broadcast. */
  readonly subscriptionKey: string;
  readonly streamKey: string;
  /** The window, which is a bound on the mesh's own behaviour rather than a fact about anybody. */
  readonly fromInstant: ISODateString;
  readonly toInstant: ISODateString;
  readonly status: ReplayStatus;
  /** Who asked. */
  readonly requestedBy: Uuid;
  /** And who agreed, where anybody has. Two people on the record, which is the point of the workflow. */
  readonly approvedBy: Uuid | null;
  /** How many messages the approver was told the window covers. Null until somebody has been told. */
  readonly messageCount: number | null;
  /** How many actually went out. Null until a run has stopped, whether or not it finished. */
  readonly deliveredCount: number | null;
  /** Whether messages are going out right now. */
  readonly running: boolean;
  /** Whether the request admits no further transition. */
  readonly settled: boolean;
  /** Whether it is still waiting on somebody. */
  readonly needsApproval: boolean;
}

const replayPayload = (request: ReplayRequest): ReplayRequestEventPayload => ({
  replayId: request.id,
  organizationId: request.organizationId,
  subscriptionId: request.subscriptionId,
  subscriptionKey: request.subscriptionKey,
  streamKey: request.streamKey,
  fromInstant: request.fromInstant,
  toInstant: request.toInstant,
  status: request.status,
  requestedBy: request.requestedBy,
  approvedBy: request.approvedBy,
  messageCount: request.messageCount,
  deliveredCount: request.deliveredCount,
  running: isReplayRunning(request),
  settled: isReplaySettled(request),
  needsApproval: replayNeedsApproval(request),
});

export type ReplayRequestedEvent = DomainEvent<typeof REPLAY_REQUESTED, ReplayRequestEventPayload>;
export type ReplayApprovedEvent = DomainEvent<typeof REPLAY_APPROVED, ReplayRequestEventPayload>;
export type ReplayRejectedEvent = DomainEvent<typeof REPLAY_REJECTED, ReplayRequestEventPayload>;
export type ReplayStartedEvent = DomainEvent<typeof REPLAY_STARTED, ReplayRequestEventPayload>;
export type ReplayCompletedEvent = DomainEvent<typeof REPLAY_COMPLETED, ReplayRequestEventPayload>;
export type ReplayFailedEvent = DomainEvent<typeof REPLAY_FAILED, ReplayRequestEventPayload>;
export type ReplayCancelledEvent = DomainEvent<typeof REPLAY_CANCELLED, ReplayRequestEventPayload>;

/**
 * Somebody asked for a window of the past to be sent again. Nothing has moved yet.
 *
 * Published at the request rather than only at the approval, because the request is what an approver has to
 * find in order to act on it, and a workflow whose first visible event is the approval is a workflow where
 * requests sit unread. The reason the requester wrote stays on the record.
 */
export const replayRequested = (request: ReplayRequest): ReplayRequestedEvent =>
  createEvent(REPLAY_REQUESTED, replayPayload(request), { tenantId: request.tenantId });

/** A second person agreed, and was told how many messages the window covers before doing so. */
export const replayApproved = (request: ReplayRequest): ReplayApprovedEvent =>
  createEvent(REPLAY_APPROVED, replayPayload(request), { tenantId: request.tenantId });

/** Refused before anything happened, which is different from a run that did not finish. */
export const replayRejected = (request: ReplayRequest): ReplayRejectedEvent =>
  createEvent(REPLAY_REJECTED, replayPayload(request), { tenantId: request.tenantId });

/**
 * Messages from the past are now arriving at a live consumer.
 *
 * Worth its own event because a consumer's own downstream effects are about to happen again. A team that
 * knows a replay has started can hold a reconciliation, mute an alert or expect the duplicate; a team that
 * finds out from the duplicates cannot.
 */
export const replayStarted = (request: ReplayRequest): ReplayStartedEvent =>
  createEvent(REPLAY_STARTED, replayPayload(request), { tenantId: request.tenantId });

export const replayCompleted = (request: ReplayRequest): ReplayCompletedEvent =>
  createEvent(REPLAY_COMPLETED, replayPayload(request), { tenantId: request.tenantId });

/**
 * A run that had started did not finish, and the delivered count says how far it got.
 *
 * The count is the field that matters here and the reason a failure is not just a rejection with a worse
 * name. A replay that stopped after eleven thousand of ninety thousand messages has left the consumer in a
 * state nobody designed, and the number is what makes the next decision possible.
 */
export const replayFailed = (request: ReplayRequest): ReplayFailedEvent =>
  createEvent(REPLAY_FAILED, replayPayload(request), { tenantId: request.tenantId });

/** Stopped by a person, before or during the run. What they said stays on the record. */
export const replayCancelled = (request: ReplayRequest): ReplayCancelledEvent =>
  createEvent(REPLAY_CANCELLED, replayPayload(request), { tenantId: request.tenantId });
