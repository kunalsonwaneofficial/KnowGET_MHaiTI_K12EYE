/**
 * Value objects for Event Mesh, Streaming & Messaging (P3-D02). These are the vocabulary of the spine every
 * institutional fact travels along — what an event type is, which stream carries it, which backbone that stream
 * is bound to, who consumes it under what guarantee, and what is allowed to be replayed. They are TEXT in the
 * store and closed unions here, for the reason every contract before this one freezes its grammar and leaves its
 * catalog open: the *kinds* of guarantee, ordering and failure a mesh can offer are few and stable, while the set
 * of event types, streams and consumers is unbounded and grows for as long as the platform is used.
 *
 * P1-M05 already gave the platform an event bus and a transactional outbox, and this module is careful not to
 * restate either. An outbox record is a publication *pending*; nothing in it says what the event type means, who
 * is entitled to the event, which position a consumer has reached or whether the thing may be sent again. Those
 * are the questions here, and they are governance rather than mechanism.
 *
 * Five things in this module are contract rules made structural rather than editorial:
 *
 * **A guarantee is a member of a union, not a paragraph.** {@link DELIVERY_SEMANTICS} names the three deliveries
 * a consumer can be promised, and {@link requiresDeduplication} says which of them obliges the mesh to keep a
 * ledger. A platform whose "exactly once" lives in documentation has at-least-once with extra confidence.
 *
 * **Retention bounds replay, and the vocabulary knows it.** {@link PAYLOAD_RETENTIONS} distinguishes a stream
 * that retains what it carried from one that retains only that it carried something. A stream declaring `none`
 * is not replayable with a payload — not by policy, but because there is nothing to replay — and
 * {@link isReplayable} is the single predicate every replay path asks. Making the absence explicit is what stops
 * a mesh from becoming an undeclared archive of every fact the institution has ever recorded.
 *
 * **Ordering is a promise about partitions.** {@link ORDERING_GUARANTEES} has three members and the middle one
 * is the honest default: order within a partition, no order across them. `global` exists because some streams
 * genuinely need it and it must be *declarable*, but it is a single-partition stream by construction, which is a
 * throughput ceiling somebody should have to choose rather than discover.
 *
 * **Nothing here reads a clock or a random source.** Retention is a duration, a lag band is a threshold, and a
 * partition is a hash of a declared key. Every function in this package that needs to know when it is takes the
 * instant as an argument, which is what makes a delivery verdict, a prune decision and a replay refusal all
 * reproducible from the record alone months later.
 *
 * **A backbone is named by reference, never inlined.** {@link isTransportReference} is what stands between a
 * binding and a broker password in a database column. A mesh is the one place in the platform where a single
 * leaked connection string reads every fact the institution has, so the value objects refuse the secret instead
 * of trusting the caller not to send it.
 */

import { parseIso, toIso } from "@knowget/shared";
import type { ISODateString } from "@knowget/types";

// --- Keys ------------------------------------------------------------------------

/**
 * The maximum length of a key in this package — an event-type key, a stream key, a subscription key, a consumer
 * group, a partition-key path.
 *
 * Generous rather than tight, and deliberately the same number the gateway chose, because the two packages name
 * overlapping things from opposite sides: `admissions.application.submitted` is a capability there and an event
 * type here, and a platform where the same string fits one surface and not the other is a platform with a
 * migration nobody scheduled.
 */
export const MAX_KEY_LENGTH = 128;

/**
 * The shape every key in this package must take: lowercase alphanumerics in dot-, dash- or underscore-separated
 * segments.
 *
 * Uppercase is excluded rather than folded, for the reason it is excluded everywhere else in the platform: two
 * consumers holding different beliefs about the name of the event they both subscribed to is a fault that
 * presents as one of them silently receiving nothing.
 */
const KEY_PATTERN = /^[a-z0-9]+([._-][a-z0-9]+)*$/;

/** Trim and lowercase a key so that comparison, storage and display all agree on one form. */
export const normalizeKey = (value: string): string => value.trim().toLowerCase();

/** Whether a normalized key is well-formed and within length. */
export const isValidKey = (value: string): boolean =>
  value.length > 0 && value.length <= MAX_KEY_LENGTH && KEY_PATTERN.test(value);

/**
 * Render an instant in the one width every comparison in this package assumes: milliseconds, `Z`, no offset.
 *
 * The mesh compares instants lexically in places where the store does the comparing — a retention sweep, a
 * replay window, a checkpoint staleness read — and ISO-8601 admits several spellings of the same moment whose
 * lexical order is not their chronological order. `2027-01-01T00:00:00Z` sorts after `2027-01-01T00:00:00.500Z`
 * as text while preceding it in time. Normalising on the way in and on the way out is the whole fix, and it
 * belongs in the vocabulary because both halves must agree and they live in different packages.
 */
export const fixedWidthInstant = (instant: ISODateString): ISODateString =>
  toIso(parseIso(instant));

// --- Event-type schemas ----------------------------------------------------------

/**
 * The field types an event payload schema may declare.
 *
 * This is deliberately a small closed set and not JSON Schema. The mesh's compatibility engine has to answer one
 * question — can a consumer written against version N read version N+1 — and answering it requires the schema
 * language to be decidable, which JSON Schema with its combinators, conditionals and remote references is not.
 * Seven types cover what an institutional event payload actually contains, and the cost of the eighth is a new
 * member here plus a compatibility rule beside it, which is exactly the review such an addition deserves.
 */
export const SCHEMA_FIELD_TYPES = Object.freeze([
  "string",
  "number",
  "boolean",
  "instant",
  "uuid",
  "object",
  "array",
] as const);

/** A declared type for a field in an event payload schema. */
export type SchemaFieldType = (typeof SCHEMA_FIELD_TYPES)[number];

/**
 * One declared field of an event payload.
 *
 * `required` is the field that makes compatibility decidable in both directions: adding a required field breaks
 * a consumer reading the new version with old expectations only if it validates strictly, while adding a
 * *required* field breaks every **producer** still writing the old shape. The engine treats the two directions
 * separately, which it can only do because requiredness is declared rather than inferred from the examples
 * somebody happened to send.
 */
export interface SchemaField {
  readonly name: string;
  readonly type: SchemaFieldType;
  readonly required: boolean;
}

/**
 * The maximum number of fields an event payload schema may declare.
 *
 * A ceiling exists because a schema is compared field-by-field against its predecessor on every version
 * registration, and because an event payload with more than this many fields is not an event — it is a record
 * being shipped through a mesh, and the thing that wants it is a data product (P3-D11) rather than a subscriber.
 */
export const MAX_SCHEMA_FIELDS = 64;

/**
 * The compatibility rule a registered event type promises across its versions.
 *
 * The four members are the standard ones, and the reason to enforce rather than document them is that the
 * failure they prevent is asymmetric. A producer that adds a field learns nothing; the consumer that breaks is
 * somebody else's code in somebody else's deployment, and it breaks at the moment the first event of the new
 * shape arrives rather than at the moment the change was made.
 *
 * - `backward` — a consumer of the *old* version can read the *new* one. Fields may be added optionally and
 *   removed only if they were optional. This is the default because it is what a subscriber needs.
 * - `forward` — a consumer of the *new* version can read the *old* one. Fields may be removed and added only as
 *   required. This is what a *replayer* needs: code written today reading a year of history.
 * - `full` — both, which in practice permits optional additions and nothing else.
 * - `none` — no promise. Legitimate for a stream with exactly one consumer that ships with the producer, and a
 *   red flag anywhere else, which is why it has to be chosen by name.
 */
export const COMPATIBILITY_MODES = Object.freeze(["backward", "forward", "full", "none"] as const);

/** The compatibility rule an event type promises across versions. */
export type CompatibilityMode = (typeof COMPATIBILITY_MODES)[number];

/** The mode a new event type takes unless it says otherwise — what a subscriber needs. */
export const DEFAULT_COMPATIBILITY_MODE: CompatibilityMode = "backward";

/**
 * The lifecycle of a registered event type.
 *
 * `published` is a one-way door: from there a version's schema is frozen, because the shape is what every
 * consumer wrote their reader against. A change is a new version beside it, and the old one is deprecated with
 * notice rather than edited. `retired` is terminal and means the mesh will refuse to publish the type at all —
 * which is a stronger statement than `deprecated`, and the reason both exist.
 */
export const EVENT_TYPE_STATUSES = Object.freeze([
  "draft",
  "published",
  "deprecated",
  "retired",
] as const);

/** The lifecycle state of a registered event type. */
export type EventTypeStatus = (typeof EVENT_TYPE_STATUSES)[number];

/** Where a freshly registered event type starts. */
export const INITIAL_EVENT_TYPE_STATUS: EventTypeStatus = "draft";

/** Whether an event-type state admits no further transition. */
export const isTerminalEventTypeStatus = (status: EventTypeStatus): boolean => status === "retired";

/**
 * Whether an event type in this state may be published to the mesh.
 *
 * A deprecated type still publishes, which is the entire point of deprecation: the notice period exists so that
 * consumers can migrate while events keep flowing. A mesh where deprecation stopped delivery would be a mesh
 * where nobody ever deprecates anything.
 */
export const isEventTypePublishable = (status: EventTypeStatus): boolean =>
  status === "published" || status === "deprecated";

/**
 * Whether an event type's schema may still be edited.
 *
 * Only a draft. This predicate is the freeze, and it is a function rather than a comparison at each call site so
 * that there is exactly one place to read when somebody asks what "immutable once published" means here.
 */
export const isEventTypeSchemaEditable = (status: EventTypeStatus): boolean => status === "draft";

/**
 * The shortest notice an event type version may be deprecated with before it is retired.
 *
 * Ninety days, the same floor the gateway holds published API contracts to, and for the same reason: a consumer
 * of an institutional event is a system somebody has to schedule work to change. The number being identical
 * across the two contracts is deliberate — an integrator who consumes both a REST contract and an event stream
 * should not have to hold two migration calendars.
 */
export const MIN_DEPRECATION_NOTICE_DAYS = 90;

/** The first version number an event type takes. Versions are major only: a change of shape is a new number. */
export const FIRST_EVENT_TYPE_VERSION = 1;

// --- Streams ---------------------------------------------------------------------

/**
 * What a stream promises about the order its messages arrive in.
 *
 * - `none` — no promise. Cheapest, and correct for facts whose processing is commutative.
 * - `partition` — messages sharing a partition key arrive in the order they were published. This is the useful
 *   guarantee and the default: a learner's enrolment events are ordered with respect to each other, and
 *   unordered with respect to another learner's, which is what a consumer of them actually needs.
 * - `global` — one total order across the stream. Real, occasionally necessary, and a single-partition stream by
 *   construction, so it caps throughput at what one consumer can drain. It is a member rather than an omission
 *   because a mesh that cannot express it forces the need into an application-level lock, which is worse.
 */
export const ORDERING_GUARANTEES = Object.freeze(["none", "partition", "global"] as const);

/** What a stream promises about message order. */
export type OrderingGuarantee = (typeof ORDERING_GUARANTEES)[number];

/** The honest default: ordered within a partition, unordered across them. */
export const DEFAULT_ORDERING_GUARANTEE: OrderingGuarantee = "partition";

/** The partition count a `global` stream must have, because one total order is one partition. */
export const GLOBAL_ORDER_PARTITION_COUNT = 1;

/** The fewest partitions a stream may declare. */
export const MIN_PARTITION_COUNT = 1;

/**
 * The most partitions a stream may declare.
 *
 * A ceiling rather than an unbounded number, because every partition is a checkpoint row per subscription and a
 * consumer's coordination cost is linear in it. Sixty-four is far above what a K-12 institution's event volume
 * needs and far below where the bookkeeping becomes the workload.
 */
export const MAX_PARTITION_COUNT = 64;

/** The partition count a stream takes unless it says otherwise. */
export const DEFAULT_PARTITION_COUNT = 8;

/**
 * What a stream retains of the messages it carried.
 *
 * This is the most consequential union in the module, and it is here rather than in a configuration file because
 * it decides what the mesh *is*. A mesh that retains every payload by default is an archive of every
 * institutional fact — including wellbeing observations, safeguarding notes and payroll amounts — with a replay
 * button on it, assembled by nobody's decision.
 *
 * - `none` — the envelope only. The mesh records that the event happened, on which stream, at which sequence.
 *   Correct for anything carrying a fact somebody is entitled to have forgotten.
 * - `digest` — the envelope plus a digest of the payload. Enough to prove what was carried and to detect that a
 *   redelivery differs; not enough to reconstruct it.
 * - `full` — the envelope and the payload, for the retention period. Only this class is replayable with a
 *   payload, which is the coupling {@link isReplayable} exists to state once.
 */
export const PAYLOAD_RETENTIONS = Object.freeze(["none", "digest", "full"] as const);

/** What a stream retains of the messages it carried. */
export type PayloadRetention = (typeof PAYLOAD_RETENTIONS)[number];

/** The default retains a digest: provable, not reconstructable. A stream opts *into* being an archive. */
export const DEFAULT_PAYLOAD_RETENTION: PayloadRetention = "digest";

/**
 * Whether a stream with this payload-retention class can be replayed with the payload intact.
 *
 * One predicate, asked by the replay engine and by the replay-request aggregate, so that the answer cannot
 * differ between the plan and the act.
 */
export const isReplayable = (retention: PayloadRetention): boolean => retention === "full";

/** The shortest retention a stream may declare — an hour, enough for a consumer to recover from a restart. */
export const MIN_RETENTION_SECONDS = 3_600;

/**
 * The longest retention a stream may declare: three hundred and sixty-six days.
 *
 * A year plus a day, because the institutional cycle is a year and the reconciliation of one happens inside the
 * next. The ceiling exists at all because "keep it forever" is not a retention policy, it is the absence of one,
 * and the place to notice that is where somebody types the number.
 */
export const MAX_RETENTION_SECONDS = 31_622_400;

/** The retention a stream takes unless it says otherwise — thirty days. */
export const DEFAULT_RETENTION_SECONDS = 2_592_000;

/**
 * The lifecycle of a stream.
 *
 * `paused` accepts no publications and loses nothing already published, which is the state an operator wants
 * when a downstream is being repaired and the alternative is a consumer drowning. `retired` is terminal and
 * refuses publication permanently; the messages already on it remain readable until retention drops them,
 * because retiring a stream is not a licence to lose its history.
 */
export const STREAM_STATUSES = Object.freeze(["draft", "active", "paused", "retired"] as const);

/** The lifecycle state of a stream. */
export type StreamStatus = (typeof STREAM_STATUSES)[number];

/** Where a freshly declared stream starts. */
export const INITIAL_STREAM_STATUS: StreamStatus = "draft";

/** Whether a stream state admits no further transition. */
export const isTerminalStreamStatus = (status: StreamStatus): boolean => status === "retired";

/** Whether a stream in this state accepts publications. */
export const isStreamPublishable = (status: StreamStatus): boolean => status === "active";

/**
 * The maximum number of event types one stream may accept.
 *
 * A stream is a topic, and a topic that accepts everything is a bus with a name. The ceiling is the point at
 * which the honest modelling is several streams, and it is low enough to be reached by anybody heading that way.
 */
export const MAX_STREAM_EVENT_TYPES = 32;

// --- Transport bindings ----------------------------------------------------------

/**
 * The physical backbones a stream may be bound to.
 *
 * This union is the swap seam the phase plan asked for, and its members are *declarations* rather than clients.
 * Nothing in this package speaks any of these protocols; a binding records which backbone a stream is meant to
 * travel on, the composition root supplies the transport that speaks it, and a stream moving from `outbox` to
 * `kafka` is a new binding and zero changes to any publisher or consumer. That is the whole point of the
 * indirection, and it is why the members name products the platform does not depend on: naming them here costs a
 * string, and the alternative — a `transport` column typed free text — costs the ability to ask which streams
 * are on which backbone.
 *
 * - `in_process` — the P1-M05 in-memory bus. Correct for a single-node deployment and for tests.
 * - `outbox` — the P1-M05 transactional outbox and relay. The default, because it is the only member that
 *   survives a crash between the business write and the publication without a second system.
 * - `kafka`, `nats`, `redpanda`, `amqp` — declarable, each awaiting an adapter at the composition root.
 */
export const TRANSPORT_KINDS = Object.freeze([
  "in_process",
  "outbox",
  "kafka",
  "nats",
  "redpanda",
  "amqp",
] as const);

/** A physical backbone a stream may be bound to. */
export type TransportKind = (typeof TRANSPORT_KINDS)[number];

/** The default backbone: the transactional outbox, the only one that is crash-safe without a second system. */
export const DEFAULT_TRANSPORT_KIND: TransportKind = "outbox";

/**
 * The providers a binding's transport reference may name.
 *
 * `config` heads the list and is the member the gateway's equivalent union does not have, because a backbone
 * reference is mostly *not* a secret: a bootstrap server list, a topic prefix and a client id are configuration,
 * and a platform that made an operator put a hostname in a vault to satisfy a validator would get a vault full of
 * hostnames and a validator nobody trusts. The other three are here because some bindings genuinely do need
 * credentialed material, and a reference that resolves through the same three providers the rest of the platform
 * already uses is one fewer resolver to wire.
 *
 * `kms` is deliberately absent. A key-management service hands back keys, and a binding does not want a key — it
 * wants the settings a transport is constructed from. Naming it would invite somebody to store a broker password
 * as a KMS key and discover at the composition root that nothing can decrypt it.
 */
export const TRANSPORT_REF_PROVIDERS = Object.freeze([
  "config",
  "env",
  "vault",
  "secretstore",
] as const);

/** A provider a binding's transport reference may resolve through. */
export type TransportRefProvider = (typeof TRANSPORT_REF_PROVIDERS)[number];

/**
 * Whether a value is a *reference* to a transport's settings rather than the settings themselves.
 *
 * The refusals carry the meaning. A value with no recognised provider prefix is refused because it is
 * indistinguishable from an inlined connection string. Whitespace is refused because a pasted broker
 * configuration — a `sasl.jaas.config` line, a PEM block, a properties fragment — contains it and nothing
 * legitimate here does. And `://` is refused because that is a URL, which in this field is either
 * `kafka://user:password@host` with the credential in the authority or an endpoint in the wrong column, and both
 * are worth failing a binding over.
 *
 * What this cannot do is prove the handle points at something wired in. That is the composition root's answer,
 * and it arrives as {@link TransportKind} availability rather than as a reference check. What it can do is make
 * it impossible for a live broker password to reach the store as a column value, which is the failure that
 * outlives every rotation because nobody knows it happened.
 */
export const isTransportReference = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_KEY_LENGTH) return false;
  if (/\s/.test(trimmed) || trimmed.includes("://")) return false;
  const separator = trimmed.indexOf(":");
  if (separator <= 0 || separator === trimmed.length - 1) return false;
  const provider = trimmed.slice(0, separator);
  return (TRANSPORT_REF_PROVIDERS as readonly string[]).includes(provider);
};

/**
 * The lifecycle of a stream's binding to a backbone.
 *
 * `draining` is the member that makes a backbone swap safe. A binding being replaced does not stop carrying what
 * it already accepted; it stops accepting new messages while its consumers catch up, and only then retires. A
 * mesh whose bindings went straight from active to retired would lose whatever was in flight, which is exactly
 * the outage a migration is supposed to avoid.
 */
export const BINDING_STATUSES = Object.freeze([
  "declared",
  "active",
  "draining",
  "retired",
] as const);

/** The lifecycle state of a stream-to-backbone binding. */
export type BindingStatus = (typeof BINDING_STATUSES)[number];

/** Where a freshly declared binding starts. */
export const INITIAL_BINDING_STATUS: BindingStatus = "declared";

/** Whether a binding state admits no further transition. */
export const isTerminalBindingStatus = (status: BindingStatus): boolean => status === "retired";

/** Whether a binding in this state carries new publications. Only one binding per stream may be here. */
export const isBindingCarrying = (status: BindingStatus): boolean => status === "active";

/** Whether a binding still has to be drained before it can retire. */
export const isBindingDraining = (status: BindingStatus): boolean => status === "draining";

// --- Subscriptions ---------------------------------------------------------------

/**
 * What the mesh promises a consumer about how many times it will see a message.
 *
 * - `at_most_once` — delivered once or not at all. The mesh does not retry, so a consumer failure is a lost
 *   message. Legitimate for high-volume telemetry where the next one is along shortly.
 * - `at_least_once` — delivered until acknowledged. The consumer may see duplicates and must be idempotent. This
 *   is the default and it is what the P1-M05 outbox relay already provides.
 * - `exactly_once` — delivered until acknowledged, with the mesh keeping a per-subscription ledger of what it
 *   has already handed over so a redelivery is suppressed rather than passed on. This is *effectively* once from
 *   the consumer's side, which is the only honest form of the promise: the mesh cannot make a consumer's own
 *   side effect transactional with the acknowledgement, and any implementation claiming otherwise is at-least-
 *   once plus a ledger somebody else is keeping.
 */
export const DELIVERY_SEMANTICS = Object.freeze([
  "at_most_once",
  "at_least_once",
  "exactly_once",
] as const);

/** What the mesh promises a consumer about delivery count. */
export type DeliverySemantics = (typeof DELIVERY_SEMANTICS)[number];

/** The default promise, and the one the existing outbox relay already keeps. */
export const DEFAULT_DELIVERY_SEMANTICS: DeliverySemantics = "at_least_once";

/**
 * Whether these semantics oblige the mesh to keep a deduplication ledger.
 *
 * Only `exactly_once`. This predicate is where the promise becomes a cost, and having it as a function means the
 * ledger is written because the semantics demand it rather than because a code path happened to.
 */
export const requiresDeduplication = (semantics: DeliverySemantics): boolean =>
  semantics === "exactly_once";

/** Whether these semantics oblige the mesh to retry a failed delivery. */
export const requiresRetry = (semantics: DeliverySemantics): boolean =>
  semantics !== "at_most_once";

/**
 * The lifecycle of a durable subscription.
 *
 * `paused` holds the checkpoint still and lets the stream advance past it, which is the state that makes a
 * consumer deployment safe: pause, deploy, resume, and the mesh delivers the backlog. `retired` is terminal and
 * releases the checkpoint, because a retired subscription's position is not a thing anybody will resume from.
 */
export const SUBSCRIPTION_STATUSES = Object.freeze([
  "registered",
  "active",
  "paused",
  "retired",
] as const);

/** The lifecycle state of a durable subscription. */
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Where a freshly registered subscription starts. */
export const INITIAL_SUBSCRIPTION_STATUS: SubscriptionStatus = "registered";

/** Whether a subscription state admits no further transition. */
export const isTerminalSubscriptionStatus = (status: SubscriptionStatus): boolean =>
  status === "retired";

/** Whether a subscription in this state receives deliveries. */
export const isSubscriptionDeliverable = (status: SubscriptionStatus): boolean =>
  status === "active";

/** The fewest attempts a subscription may allow before a message is dead-lettered. */
export const MIN_DELIVERY_ATTEMPTS = 1;

/**
 * The most attempts a subscription may allow.
 *
 * Ten, and the ceiling matters more than the number: a subscription permitted unlimited attempts turns a
 * permanently poisonous message into a permanently blocked partition, and the operator sees a lag graph rather
 * than a dead letter naming the message and the reason. A ceiling is what converts the first failure mode into
 * the second.
 */
export const MAX_DELIVERY_ATTEMPTS = 10;

/** The attempt ceiling a subscription takes unless it says otherwise. */
export const DEFAULT_DELIVERY_ATTEMPTS = 5;

// --- Filters ---------------------------------------------------------------------

/**
 * The predicates a subscription may filter its stream with.
 *
 * Six operators, all decidable against a single envelope with no I/O and no regular expressions. The absence of
 * a regex operator is deliberate: a filter is evaluated once per message per subscription, an operator whose
 * cost is a function of the *pattern* rather than the input is a denial of service somebody configures by
 * accident, and `prefix` covers what a namespaced key is actually asked.
 */
export const FILTER_OPERATORS = Object.freeze([
  "equals",
  "not_equals",
  "in",
  "prefix",
  "present",
  "absent",
] as const);

/** A predicate operator a subscription filter may use. */
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

/**
 * One predicate over an envelope attribute.
 *
 * `values` is always a list, even for `equals`, so that the shape does not change with the operator — a stored
 * filter is read by the routing engine, by the API and by whoever is debugging why a subscription is empty, and
 * a union-typed field would make all three of those a discriminated switch for no gain. `present` and `absent`
 * ignore it.
 */
export interface FilterPredicate {
  readonly attribute: string;
  readonly operator: FilterOperator;
  readonly values: readonly string[];
}

/** Whether an operator draws on `values` at all. */
export const operatorTakesValues = (operator: FilterOperator): boolean =>
  operator !== "present" && operator !== "absent";

/**
 * The maximum number of predicates one subscription filter may hold.
 *
 * Predicates are conjunctive — all must hold — so a long filter is a narrow one, and a subscription that needs
 * more than this many conditions is describing a query rather than a subscription. The routing engine's cost is
 * linear in this number times the number of subscriptions on the stream, which is the reason for a ceiling
 * rather than a warning.
 */
export const MAX_FILTER_PREDICATES = 16;

/** The maximum number of values one predicate may carry, for the same reason a filter has a ceiling. */
export const MAX_FILTER_VALUES = 32;

// --- Delivery outcomes -----------------------------------------------------------

/**
 * What the mesh decided to do with one message for one subscription.
 *
 * These are *verdicts* rather than results: nothing in this package performs a delivery. The engine computes
 * which of these applies from the subscription's semantics, the attempt history and the deduplication ledger,
 * and whatever runs the loop acts on it. Keeping the decision separable from the act is what lets an operator
 * ask why a message was skipped and get an answer that does not depend on a log having been kept.
 *
 * - `deliver` — hand it over.
 * - `filtered` — the subscription's filter excluded it. Not a failure and not a delivery.
 * - `duplicate` — the deduplication ledger has already seen it under `exactly_once`; suppress it.
 * - `dead_letter` — this attempt failed and the attempt ceiling is now reached.
 * - `abandoned` — this attempt failed and the semantics do not retry, so there is nothing further to try.
 */
export const DELIVERY_VERDICTS = Object.freeze([
  "deliver",
  "filtered",
  "duplicate",
  "dead_letter",
  "abandoned",
] as const);

/** What the mesh decided to do with one message for one subscription. */
export type DeliveryVerdict = (typeof DELIVERY_VERDICTS)[number];

/**
 * Why a message ended up in the dead-letter record.
 *
 * A closed set, because the first thing anybody does with a dead letter is group by reason, and free text makes
 * that a text-processing exercise. Each member has a different remedy, which is the test for whether it deserves
 * to be its own member: fix the consumer, fix the producer's payload, raise the timeout, register the schema,
 * reconcile the versions, wait for the backbone.
 */
export const DEAD_LETTER_REASONS = Object.freeze([
  "consumer_error",
  "payload_rejected",
  "timeout",
  "attempts_exhausted",
  "schema_unknown",
  "schema_incompatible",
  "transport_unavailable",
] as const);

/** Why a message ended up dead-lettered. */
export type DeadLetterReason = (typeof DEAD_LETTER_REASONS)[number];

/**
 * The lifecycle of a dead-letter record.
 *
 * Two terminal states and no delete. `replayed` says somebody sent it again; `discarded` says somebody decided
 * not to, and both carry who and why. A dead-letter table with a delete path is a table where the record of a
 * message the institution never processed can be removed by whoever is tidying up, and the question it answers —
 * what did we drop — is asked precisely when nobody can remember.
 */
export const DEAD_LETTER_STATUSES = Object.freeze(["open", "replayed", "discarded"] as const);

/** The lifecycle state of a dead-letter record. */
export type DeadLetterStatus = (typeof DEAD_LETTER_STATUSES)[number];

/** Where a freshly recorded dead letter starts. */
export const INITIAL_DEAD_LETTER_STATUS: DeadLetterStatus = "open";

/** Whether a dead-letter state admits no further transition. */
export const isTerminalDeadLetterStatus = (status: DeadLetterStatus): boolean => status !== "open";

/** The shortest explanation accepted when a dead letter is discarded or a replay is requested. */
export const MIN_REASON_LENGTH = 8;

/** The longest such explanation. Long enough for a paragraph, short enough not to be a document. */
export const MAX_REASON_LENGTH = 1_024;

// --- Checkpoints and lag ---------------------------------------------------------

/** The sequence number the first message on a stream takes. Sequences are per stream and gapless. */
export const FIRST_SEQUENCE = 1;

/**
 * The position a checkpoint holds before its subscription has committed anything.
 *
 * Zero rather than one, so that "committed nothing" and "committed the first message" are different values. A
 * mesh that conflated them would re-deliver the first message of every stream to every new subscription forever,
 * or skip it once, and which of those it did would depend on the order two conditions were written in.
 */
export const UNCOMMITTED_POSITION = 0;

/**
 * How far behind the head of its stream a subscription is allowed to be before its state is worth naming.
 *
 * - `current` — within {@link LAG_BEHIND_THRESHOLD} messages of the head.
 * - `behind` — further than that but still advancing.
 * - `stalled` — behind and not advancing: the committed position has not moved for
 *   {@link LAG_STALLED_AFTER_SECONDS}.
 *
 * Bands rather than a raw number, because the raw number is already on the record and what an operator needs is
 * the threshold decision made once, consistently, by something testable.
 */
export const LAG_BANDS = Object.freeze(["current", "behind", "stalled"] as const);

/** How far behind the head of its stream a subscription is. */
export type LagBand = (typeof LAG_BANDS)[number];

/** The lag, in messages, at which a subscription stops being `current`. */
export const LAG_BEHIND_THRESHOLD = 1_000;

/**
 * How long a non-zero lag may go without the committed position moving before the subscription is `stalled`.
 *
 * Fifteen minutes. Long enough that a slow consumer working through a backlog is not called stalled, short
 * enough that a consumer which died holding a partition is noticed within one attention span.
 */
export const LAG_STALLED_AFTER_SECONDS = 900;

// --- Replay ----------------------------------------------------------------------

/**
 * The lifecycle of a replay request.
 *
 * Replay is the most dangerous capability in this contract and the lifecycle is the safeguard. Re-delivering a
 * month of enrolment events to a subscription whose consumer is not idempotent will re-send a month of emails,
 * re-issue a month of invoices, or re-post a month of ledger entries. So a replay is *requested* with a reason,
 * *approved* by somebody other than the requester where the institution requires it, and only then *runs* — and
 * every one of those is on the record.
 *
 * `rejected` is distinct from `failed`: rejected means the request was refused before anything happened —
 * outside retention, wrong payload class, window too wide — while failed means a replay that started did not
 * finish. Collapsing them would lose the difference between "we would not" and "we could not".
 */
export const REPLAY_STATUSES = Object.freeze([
  "requested",
  "approved",
  "rejected",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const);

/** The lifecycle state of a replay request. */
export type ReplayStatus = (typeof REPLAY_STATUSES)[number];

/** Where a freshly raised replay request starts. */
export const INITIAL_REPLAY_STATUS: ReplayStatus = "requested";

/** Whether a replay state admits no further transition. */
export const isTerminalReplayStatus = (status: ReplayStatus): boolean =>
  status === "rejected" || status === "completed" || status === "failed" || status === "cancelled";

/**
 * Why a replay was refused.
 *
 * Every member is a refusal the requester can act on, which is the test a reason code has to pass. "Outside
 * retention" tells them the data is gone; "payload not retained" tells them the stream was never an archive;
 * "window too wide" tells them to split the request; "subscription not deliverable" tells them to resume it
 * first. A single `invalid` would tell them to ask somebody.
 */
export const REPLAY_REFUSAL_REASONS = Object.freeze([
  "window_outside_retention",
  "window_inverted",
  "window_too_wide",
  "window_too_many_messages",
  "payload_not_retained",
  "stream_not_readable",
  "subscription_not_deliverable",
] as const);

/** Why a replay was refused. */
export type ReplayRefusalReason = (typeof REPLAY_REFUSAL_REASONS)[number];

/**
 * The widest window one replay request may cover: thirty-one days.
 *
 * A month, because the reconciliation that motivates most replays is monthly, and because a request wider than
 * its retention allows is a request that will be refused halfway through. Splitting a year into twelve requests
 * is a mild inconvenience which has the useful property that eleven of them can be stopped after the first one
 * goes wrong.
 */
export const MAX_REPLAY_WINDOW_SECONDS = 2_678_400;

/**
 * The most messages one replay request may cover.
 *
 * A count ceiling as well as a duration ceiling, because the two bound different failures: a wide window on a
 * quiet stream is harmless, and an hour on a busy one can be a million deliveries. The count is what a consumer
 * actually experiences.
 */
export const MAX_REPLAY_MESSAGES = 100_000;
