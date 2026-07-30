import type { CorrelationId, ISODateString, TenantId, Uuid } from "@knowget/types";
import type {
  CompatibilityMode,
  DeadLetterReason,
  DeliverySemantics,
  DeliveryVerdict,
  EventTypeStatus,
  FilterPredicate,
  LagBand,
  OrderingGuarantee,
  PayloadRetention,
  ReplayRefusalReason,
  ReplayStatus,
  SchemaField,
  SchemaFieldType,
  StreamStatus,
  SubscriptionStatus,
} from "./mesh-value";

/**
 * The shapes the mesh's engines take in and hand back.
 *
 * Every type here is a plain record with no behaviour and no identity, which is what lets the engines be tested
 * without a database, a broker, a clock or a network — and, more importantly, what makes this contract's rules
 * enforceable by the type system rather than by review. Two of those rules are visible in the declarations
 * below and are worth stating once rather than at each of them.
 *
 * **Nothing here carries a payload.** A mesh envelope describes a fact completely — who it happened to, in
 * which tenant, under which schema version, on whose authority, at what moment — and contains not one field for
 * the fact's contents. That is deliberate to the point of being the design. An envelope type with a payload
 * field would be logged, traced, echoed into a dead letter and copied into a replay plan, and every one of
 * those is a place a learner's medical note or a staff member's salary would come to rest without anybody
 * deciding that it should. What a stream is permitted to retain is a property of the stream, decided at
 * declaration time, and the aggregates that hold retained content are the only types in this package that carry
 * any.
 *
 * **Every instant is an argument.** {@link EnvelopeContext.recordedAt} is supplied by the caller rather than
 * read from a clock, so an envelope completed from the same event and the same context is byte-for-byte the
 * same envelope on every node, in every process, during a replay a year later. The same discipline runs through
 * the rest of the package's engines, and it is the reason a verdict this platform gave an institution in March
 * can be reproduced in November from the record alone.
 */

// --- Envelopes -------------------------------------------------------------------

/**
 * The thing an event happened to.
 *
 * The contract mandates aggregate identity on every message, and the reason is not tidiness. Ordering on a mesh
 * is a promise about a partition rather than about a stream, and the only ordering an institution actually
 * needs is that two facts about the *same* thing arrive in the order they occurred — that an enrolment is not
 * overtaken by its own withdrawal. Carrying the aggregate makes that promise derivable: the partition key
 * defaults to {@link AggregateReference.aggregateId}, so same-aggregate events land in the same partition
 * without any publisher having to know that partitions exist.
 *
 * `aggregateType` is a key rather than free text because it is read by operators triaging dead letters, and a
 * column holding both `enrolment` and `Enrolment` is a column that has to be normalised at every query.
 */
export interface AggregateReference {
  /** The kind of thing, in the platform's key grammar — for example `student-lifecycle.enrolment`. */
  readonly aggregateType: string;
  /** The identity of the specific thing the event is about. */
  readonly aggregateId: Uuid;
}

/**
 * A domain event completed into everything the mesh mandates before it may be carried.
 *
 * The platform's `EventMetadata` was built for an in-process bus, where the tenant and the correlation are
 * usually implicit in the call stack that is still on the stack. On a mesh neither survives: the event is read
 * by another process, possibly weeks later, possibly during a replay, and by then an envelope missing its
 * tenant is a fact that cannot be attributed to a school while an envelope missing its correlation is a fact
 * that cannot be joined to the request that caused it. This type is where those become non-negotiable, and the
 * envelope engine is the one boundary at which the information still exists to supply them.
 *
 * `causationId` is the one identity here that is legitimately absent, because a fact that begins a chain has
 * nothing before it. It is typed `Uuid | null` rather than optional so that *absent* is a value somebody
 * decided on rather than a property nobody set.
 */
export interface MeshEnvelope {
  readonly eventId: Uuid;
  /** The registered event type, normalised — for example `student-lifecycle.enrolment.confirmed`. */
  readonly eventTypeKey: string;
  /** The schema version this fact was written under; a consumer pins to it. */
  readonly eventTypeVersion: number;
  readonly tenantId: TenantId;
  readonly aggregate: AggregateReference;
  /** The capability that published the fact, for attribution when a stream carries several. */
  readonly producerKey: string;
  readonly correlationId: CorrelationId;
  /** The event this one was caused by, or `null` where this fact begins the chain. */
  readonly causationId: Uuid | null;
  /** The distributed trace this publication belongs to. The mesh stores it and never parses it. */
  readonly traceId: string;
  readonly streamKey: string;
  /** What the partitioning engine hashes. Defaults to the aggregate id, which is what preserves order. */
  readonly partitionKey: string;
  /** When the fact occurred, as the producer observed it. */
  readonly occurredAt: ISODateString;
  /** When the mesh accepted it. Supplied by the caller, because nothing in this package reads a clock. */
  readonly recordedAt: ISODateString;
}

/**
 * What the mesh boundary supplies that a `DomainEvent` cannot.
 *
 * The split between this and the event itself is the whole of decision 3 in ADR-0051 made concrete. Tightening
 * `EventMetadata` so that these were required platform-wide is the technically cleanest answer and it would
 * break thirty-six contracts at once for the benefit of a package none of them import yet; completing the
 * envelope here gets the same enforcement at the only place the mesh can enforce anything, and disturbs no
 * existing publisher.
 *
 * `tenantId`, `correlationId` and `causationId` are optional *here* and mandatory in the envelope, which is not
 * a contradiction: the event's own metadata may already carry them, and the context is where a caller supplies
 * what it did not. Something has to provide each of them, and the engine does not care which.
 */
export interface EnvelopeContext {
  /** The governed stream the fact is being published onto. */
  readonly streamKey: string;
  /** The capability publishing it. */
  readonly producerKey: string;
  /** The trace this publication belongs to. */
  readonly traceId: string;
  /** What the fact is about. */
  readonly aggregate: AggregateReference;
  /** The moment of acceptance, supplied rather than read. */
  readonly recordedAt: ISODateString;
  /** Supplied only when the event's own metadata does not carry it. */
  readonly tenantId?: TenantId;
  /** Supplied only when the event's own metadata does not carry it. */
  readonly correlationId?: CorrelationId;
  /** Supplied only when the event's own metadata does not carry it. */
  readonly causationId?: Uuid;
  /** Overrides the aggregate id as the value the partitioner hashes. Rarely wanted; occasionally necessary. */
  readonly partitionKey?: string;
}

// --- Schema compatibility --------------------------------------------------------

/**
 * One difference between a schema and the version before it.
 *
 * Seven kinds and not three, because requiredness is half of what makes a change breaking and a vocabulary
 * that says only *added*, *removed* and *changed* cannot express the two that matter most: a field that became
 * required, and a field that stopped being. Both are edits to an existing field that leave its name and its
 * type alone, and both break a reader — in opposite directions.
 *
 * The kinds are named from the perspective of the change rather than of its victim, so that the same
 * vocabulary describes a diff nobody is judging and a refusal somebody has to act on.
 */
export type SchemaChangeKind =
  | "added_required"
  | "added_optional"
  | "removed_required"
  | "removed_optional"
  | "tightened"
  | "loosened"
  | "retyped";

/**
 * A single difference, with the sentence an operator will read.
 *
 * `description` is built by the engine rather than by whatever presents the refusal, and that is the point of
 * putting it here. `SchemaIncompatibleError` carries these strings into its details, and the difference between
 * a refusal somebody acts on and one they argue with is the difference between "incompatible" and "removed the
 * required field `learnerId`". A caller that had to compose that sentence itself would compose a different one
 * in each of the places it is shown.
 *
 * `from` and `to` are the field's declared type on either side of the change, `null` where the field did not
 * exist on that side. For a requiredness change both hold the same type, which is exactly what says that the
 * shape did not move and only the promise about it did.
 */
export interface SchemaChange {
  readonly kind: SchemaChangeKind;
  readonly field: string;
  readonly from: SchemaFieldType | null;
  readonly to: SchemaFieldType | null;
  readonly description: string;
}

/** A proposed schema, the one it would stand beside, and the promise the event type made about the pair. */
export interface CompatibilityRequest {
  readonly eventTypeKey: string;
  readonly mode: CompatibilityMode;
  /** The schema of the version already registered. A first version has no predecessor and is not assessed. */
  readonly previous: readonly SchemaField[];
  /** The schema being proposed. */
  readonly next: readonly SchemaField[];
}

/**
 * What the compatibility engine concluded.
 *
 * `changes` is every difference found and `breakingChanges` is the subset the declared mode forbids, which
 * means a `full`-mode assessment and a `none`-mode assessment of the same pair of schemas produce identical
 * `changes` and different verdicts. Keeping both is what lets a registry show an author what they altered even
 * when it is refusing them, and what lets a `none`-mode type still be diffed by anybody reviewing it.
 */
export interface CompatibilityVerdict {
  readonly mode: CompatibilityMode;
  readonly compatible: boolean;
  readonly changes: readonly SchemaChange[];
  /** The `description` of each breaking change, in the order the changes were found. */
  readonly breakingChanges: readonly string[];
}

// --- Partitioning ----------------------------------------------------------------

/**
 * What a stream says about how it spreads what it carries.
 *
 * The three fields are one decision rather than three, which is why they travel together and are validated
 * together. An ordering guarantee is a claim about partitions, a partition count is what makes the claim
 * affordable or impossible, and the key path is what a publisher has to key on for the claim to mean anything.
 * Any one of them read alone is a setting; the three read together are a promise the mesh can be held to.
 *
 * This shape is also what a stream may never change once it has carried a message. Re-mapping keys onto a
 * different number of partitions leaves everything already published where it was, so a consumer that had been
 * reading a learner's enrolments in order starts finding half of them in a partition it has already passed —
 * arriving out of order, with the record still saying they are ordered, and with nothing raised anywhere.
 */
export interface PartitionDeclaration {
  readonly streamKey: string;
  readonly ordering: OrderingGuarantee;
  /** How many partitions the stream is spread across. Exactly one where the ordering is `global`. */
  readonly partitionCount: number;
  /**
   * What the stream says a partition is keyed on — for example `aggregate.aggregateId`.
   *
   * Recorded and never parsed, and the honesty of that limit matters more than the field. Verifying that a
   * publisher actually keyed on what the stream declared would mean reading payloads, which is the one thing
   * this package will not do. What gets hashed is {@link MeshEnvelope.partitionKey}, which the envelope engine
   * settles; this is the declaration a consumer reads to know what ordering it is being offered, and an
   * operator reads when the ordering turns out not to be the one they assumed.
   */
  readonly partitionKeyPath: string | null;
}

/**
 * Where one message lands, and under which promise.
 *
 * Carries the count and the guarantee alongside the index rather than only the index, because a partition
 * number is meaningless without the modulus it was taken against: partition 3 of 8 and partition 3 of 64 are
 * different places, and a stored assignment that recorded only the 3 could not be checked against the stream it
 * was computed for.
 */
export interface PartitionAssignment {
  /** The key that was hashed, after trimming. Held so an assignment can be recomputed from the record alone. */
  readonly partitionKey: string;
  /** The partition index, numbered from zero. */
  readonly partition: number;
  readonly partitionCount: number;
  readonly ordering: OrderingGuarantee;
}

// --- Routing ---------------------------------------------------------------------

/**
 * One subscription, reduced to the three things that decide whether a message reaches it.
 *
 * A projection of the subscription aggregate rather than the aggregate itself, because routing runs once per
 * message per subscription and everything else a subscription holds — its consumer group, its semantics, its
 * attempt ceiling, who registered it — belongs to the delivery decision that comes after this one. Keeping the
 * routing input this narrow is also what lets the engine be tested against a literal.
 */
export interface RoutingCandidate {
  readonly subscriptionKey: string;
  /** The stream the subscription is registered against. A message from any other stream does not reach it. */
  readonly streamKey: string;
  readonly status: SubscriptionStatus;
  /** Conjunctive: every predicate must hold. An empty filter is a subscription to everything on the stream. */
  readonly filter: readonly FilterPredicate[];
}

/**
 * Why a message did not reach a subscription.
 *
 * Three members and no free text, because the first question asked of an empty subscription is *which of these
 * is it*, and the three have three different answers: the subscription is on another stream and always was, the
 * subscription is registered or paused rather than active, or the filter it declared excluded this message. A
 * routing engine that returned only a boolean would send every one of those investigations to the logs.
 */
export type RoutingRefusal = "different_stream" | "not_deliverable" | "filtered";

/** What the routing engine concluded about one subscription. `refusal` is `null` exactly when `reached`. */
export interface RoutingDecision {
  readonly subscriptionKey: string;
  readonly reached: boolean;
  readonly refusal: RoutingRefusal | null;
}

/** One completed envelope, and every subscription that might be entitled to it. */
export interface RoutingRequest {
  readonly envelope: MeshEnvelope;
  readonly candidates: readonly RoutingCandidate[];
}

/**
 * Which subscriptions a message reaches, and what happened to the ones it did not.
 *
 * Both lists are returned for the same reason {@link CompatibilityVerdict} returns both of its: they answer two
 * different questions and a caller usually has one of each. The delivery loop wants `reached` and nothing else;
 * the operator asking why a subscription has been silent for a week wants `decisions`, and deriving it a second
 * time in whatever surface answers them would be a second implementation of the same rule.
 *
 * `decisions` is ordered by subscription key rather than by the order the candidates arrived, so that the same
 * message and the same subscriptions produce the same verdict whatever order they were read out of the store.
 */
export interface RoutingVerdict {
  readonly streamKey: string;
  readonly decisions: readonly RoutingDecision[];
  /** The keys of the reached subscriptions, in the same order they appear in `decisions`. */
  readonly reached: readonly string[];
}

// --- Delivery --------------------------------------------------------------------

/**
 * Everything the delivery decision is a function of, and nothing else.
 *
 * The fields are the facts a delivery loop already holds at the moment it is about to hand a message over: what
 * the subscription was promised, whether routing said it is entitled to this message, whether the ledger has
 * seen it, how many attempts have already failed and what the last one failed with. Assembling them into a
 * record rather than passing a subscription aggregate keeps the engine callable from a loop that has read only
 * the columns it needs, and keeps it testable against a literal.
 *
 * `matched` is the routing verdict reduced to a boolean, carried in rather than recomputed. Routing and
 * delivery are two decisions and the second depends on the first, but re-evaluating a filter here would let the
 * same message be routed to a subscription and then withheld from it for a reason the routing verdict never
 * mentioned — and the operator reading the two records would have no way to tell which was wrong.
 */
export interface DeliveryRequest {
  readonly subscriptionKey: string;
  readonly semantics: DeliverySemantics;
  /** What the subscription allows before a message is dead-lettered. */
  readonly attemptCeiling: number;
  /** How many attempts have already been made and failed. Zero on the first pass over a message. */
  readonly attemptsMade: number;
  /** Whether the routing verdict said this message reaches this subscription. */
  readonly matched: boolean;
  /** Whether the deduplication ledger has already recorded a hand-over of this message. */
  readonly alreadyDelivered: boolean;
  /** What the previous attempt failed with, or `null` when nothing has been tried yet. */
  readonly lastFailure: DeadLetterReason | null;
}

/**
 * What the mesh decided, and the two facts the decision is acted on with.
 *
 * There is no free-text explanation here, and the omission is deliberate rather than something to be filled in
 * later. A schema change carries a description because it names fields and cannot be enumerated in advance; a
 * delivery outcome is one of five verdicts and one of seven reasons, both closed sets, and a sentence beside
 * them would be a second statement of the same fact that the next person has to keep true. The prose an
 * operator reads is composed at the surface, from these.
 */
export interface DeliveryDecision {
  readonly subscriptionKey: string;
  readonly verdict: DeliveryVerdict;
  /** The attempt this authorises, numbered from one. `null` unless the verdict is `deliver`. */
  readonly attempt: number | null;
  /** Why it will not be tried again. `null` unless the verdict is `dead_letter` or `abandoned`. */
  readonly reason: DeadLetterReason | null;
}

// --- Consumer lag ----------------------------------------------------------------

/**
 * One checkpoint, read against the stream it is a position in.
 *
 * Per partition rather than per subscription, because a checkpoint is per partition and a subscription reading
 * eight of them can be current on seven and stopped on the eighth. An assessment that summed or averaged them
 * would report a healthy subscription with a dead consumer inside it, which is the precise failure the bands
 * exist to name.
 */
export interface LagRequest {
  readonly subscriptionKey: string;
  readonly partition: number;
  /** The sequence the subscription has committed, or `UNCOMMITTED_POSITION` where it has committed nothing. */
  readonly committedPosition: number;
  /** The highest sequence on this partition of the stream, or zero where nothing has been published. */
  readonly streamHead: number;
  /** When the committed position last advanced. A fresh checkpoint carries the moment it was created. */
  readonly positionMovedAt: ISODateString;
  readonly asOf: ISODateString;
}

/** How far behind one checkpoint is, and how long it has been where it is. */
export interface LagAssessment {
  readonly subscriptionKey: string;
  readonly partition: number;
  readonly band: LagBand;
  /** How many messages lie between the committed position and the head. */
  readonly lag: number;
  /** How long the committed position has been unchanged, in whole seconds. */
  readonly idleSeconds: number;
}

// --- Retention -------------------------------------------------------------------

/** One message, read against what the stream carrying it promised to keep and for how long. */
export interface RetentionRequest {
  readonly streamKey: string;
  readonly retention: PayloadRetention;
  readonly retentionSeconds: number;
  /**
   * When the message was recorded on the stream.
   *
   * Retention runs from this rather than from {@link MeshEnvelope.occurredAt}, because a message published
   * late — by a relay that was down, or by a replay — would otherwise arrive already expired and be swept
   * before any consumer saw it. The mesh keeps what it carried for as long as it said it would, counted from
   * when it took custody.
   */
  readonly recordedAt: ISODateString;
  readonly asOf: ISODateString;
}

/**
 * What is left of one message at a given moment.
 *
 * `retained` and `replayable` are two different questions, and both are answered here because the two ways a
 * replay is refused are indistinguishable to the person who requested it: the window has passed, or the stream
 * was never keeping anything to replay. A single boolean would send them to whoever knows which.
 */
export interface RetentionVerdict {
  readonly streamKey: string;
  /** The instant the message stops being retained, in the fixed width every comparison here assumes. */
  readonly expiresAt: ISODateString;
  readonly retained: boolean;
  /** Whether it could be replayed with its payload intact: still retained, on a stream that keeps payloads. */
  readonly replayable: boolean;
  /** How long the message has left, in whole seconds, floored at zero once it has expired. */
  readonly remainingSeconds: number;
}

// --- Lifecycle -------------------------------------------------------------------

/**
 * Why a status change was refused.
 *
 * Three refusals rather than one because they have three different remedies. `same_status` is a resubmitted
 * form and nothing is wrong. `terminal_status` says the record has finished and no remedy exists. Only
 * `not_permitted` means the caller asked for something the lifecycle genuinely disallows.
 */
export type TransitionRefusal = "same_status" | "terminal_status" | "not_permitted";

/**
 * Whether a status change is permitted.
 *
 * One shape serves all six progressions in this package — event types, streams, bindings, subscriptions, dead
 * letters and replay requests — because they differ in which moves they allow and not at all in how a refusal
 * is shaped. Six identical verdict types would be six places to forget the same fix.
 */
export interface TransitionVerdict {
  readonly allowed: boolean;
  readonly refusal: TransitionRefusal | null;
}

/**
 * Why a proposed deprecation was refused.
 *
 * `retirement_before_announcement` is kept apart from `notice_too_short` although both are failures of the same
 * arithmetic, because they are different mistakes. A retirement date earlier than its own announcement is a
 * transposed pair of arguments; reporting it as short notice would send somebody to argue about the floor when
 * what they have is a bug.
 */
export type EventTypeDeprecationRefusal =
  "not_published" | "retirement_before_announcement" | "notice_too_short";

/**
 * A proposed deprecation of one event type version, and the two dates that bound the notice it gives.
 *
 * The version travels with the key because deprecation in this package is per version rather than per type. A
 * consumer reading `student-lifecycle.enrolment` v2 is unaffected by v1 being withdrawn, and a notice addressed
 * to the type would tell every consumer of every version to migrate.
 */
export interface EventTypeDeprecationRequest {
  readonly eventTypeKey: string;
  readonly version: number;
  readonly status: EventTypeStatus;
  /** When the deprecation is announced to consumers. */
  readonly announcedAt: ISODateString;
  /** When the version is proposed to stop being publishable. */
  readonly retireAt: ISODateString;
}

/** Whether a deprecation may be announced on the terms proposed, and the notice those terms actually give. */
export interface EventTypeDeprecationVerdict {
  readonly allowed: boolean;
  /** Whole days from announcement to retirement. Zero where the dates do not describe a notice period. */
  readonly noticeDays: number;
  readonly refusal: EventTypeDeprecationRefusal | null;
}

/**
 * Why an event type version does or does not accept a publication at the instant asked about.
 *
 * `within_notice` covers both the undeprecated version and the deprecated one whose retirement has not arrived,
 * because in both cases the answer to the caller is the same — publish — and the difference between them is
 * carried by {@link PublicationVerdict.deprecated} rather than by a second reason nobody would branch on.
 */
export type PublicationReason =
  "within_notice" | "event_type_retired" | "event_type_not_publishable";

/** One event type version, read against the deprecation calendar it is on at a named instant. */
export interface PublicationRequest {
  readonly eventTypeKey: string;
  readonly version: number;
  readonly status: EventTypeStatus;
  /** When the deprecation was announced, or `null` where none has been. */
  readonly deprecatedAt: ISODateString | null;
  /** When the version stops being publishable, or `null` where no date has been set. */
  readonly retireAt: ISODateString | null;
  readonly asOf: ISODateString;
}

/**
 * Whether the mesh accepts a publication of this version at this instant, and on what terms.
 *
 * `deprecated` is on the verdict rather than derived from the status by the caller, because it is a statement
 * about the instant asked about rather than about the record: a version deprecated in June, asked about in
 * March, was not deprecated then and the producer was not told to move. An audit that read the status column
 * instead would conclude that callers had been warned when they had not been.
 */
export interface PublicationVerdict {
  readonly publishable: boolean;
  readonly deprecated: boolean;
  /** Whole days until retirement, floored at zero. `null` where no retirement date has been set. */
  readonly daysUntilRetirement: number | null;
  readonly reason: PublicationReason;
}

// --- Replay ----------------------------------------------------------------------

/**
 * A proposed replay: which subscription, over which stream, across which window, judged at which instant.
 *
 * Everything the refusal rules read arrives here as a plain value, including the three facts that come from
 * other records — what the stream retains, what state it is in, what state the subscription is in. That is what
 * makes a refusal reproducible: the row that was refused in March can be re-judged in November and give the
 * same answer, which is the only way to settle an argument about whether a replay should have been allowed.
 *
 * {@link ReplayWindowRequest.messageCount} is counted by the caller rather than estimated here, because
 * only the store knows how many messages a window actually holds, and a ceiling enforced against a guess is
 * not a ceiling.
 */
export interface ReplayWindowRequest {
  readonly subscriptionKey: string;
  readonly streamKey: string;
  /**
   * The first instant of the window.
   *
   * Read against {@link RetentionRequest.recordedAt} rather than against when the facts occurred, so that the
   * window a requester asks for is the window retention is measured in. A replay bounded by occurrence would
   * ask for messages that were recorded outside it.
   */
  readonly fromInstant: ISODateString;
  /** The last instant of the window. Equal to the first for a window covering a single moment. */
  readonly toInstant: ISODateString;
  /** How many messages the window holds, counted from the store by the caller. */
  readonly messageCount: number;
  readonly retention: PayloadRetention;
  readonly retentionSeconds: number;
  readonly streamStatus: StreamStatus;
  readonly subscriptionStatus: SubscriptionStatus;
  readonly asOf: ISODateString;
}

/**
 * Whether the replay may run, and the three figures a refused requester needs to ask again successfully.
 *
 * Every figure travels on every verdict, refusals included, for the reason {@link EventTypeDeprecationVerdict}
 * carries its notice: a requester told only *too wide* has to guess, and one told the width they asked for, the
 * count it covers and the instant their window has to start after can fix the request without asking anybody.
 */
export interface ReplayWindowVerdict {
  readonly subscriptionKey: string;
  readonly allowed: boolean;
  readonly refusal: ReplayRefusalReason | null;
  /** The width of the window in whole seconds. Zero where the window could not be read as one. */
  readonly windowSeconds: number;
  readonly messageCount: number;
  /** The instant at or before which everything has expired. A replayable window starts after it. */
  readonly retentionCutoff: ISODateString;
}

/** Why an approval was refused. */
export type ReplayApprovalRefusal = "not_awaiting_approval" | "self_approval";

/**
 * Somebody approving a replay request that somebody raised.
 *
 * Both people are on the request rather than only the approver, because the rule this exists to enforce is that
 * they are different people, and a check that could only see one of them would have to trust the caller to have
 * compared them.
 */
export interface ReplayApprovalRequest {
  readonly replayId: Uuid;
  readonly status: ReplayStatus;
  readonly requestedBy: Uuid;
  readonly approvedBy: Uuid;
}

/** Whether the approval stands. */
export interface ReplayApprovalVerdict {
  readonly allowed: boolean;
  readonly refusal: ReplayApprovalRefusal | null;
}
