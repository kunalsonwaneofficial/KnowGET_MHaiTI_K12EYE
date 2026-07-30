import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
const isoDate = z.string().datetime();

/**
 * A magnitude, checked only for being a number.
 *
 * Partition counts, retention seconds, attempt ceilings, committed positions, delivered totals and schema
 * versions all come through here, and none of their real rules are stated here. Integrality, positivity, the
 * partition ceiling, the retention floor and roof, the replay window ceilings and the rule that a position may
 * not exceed a stream's head are enforced by the aggregates, each raising a named error saying which quantity
 * was wrong and what it should have been. Restating any of them at this layer would put two definitions of a
 * valid number in the repository, and which one an operator hit would depend on which layer they reached first.
 */
const count = z.number().finite();

/**
 * A mesh key, checked only for presence.
 *
 * Every key in this domain — event type, stream, subscription, consumer group, producer, trace, aggregate type —
 * goes through the package's own `normalizeKey` and `isValidKey` on the way into an aggregate or an envelope,
 * which lowercases it, bounds its length and refuses anything outside the platform's key grammar with a named
 * error saying which kind of key and what was wrong with it. A second pattern here would be a second grammar to
 * keep in step, and the first time the two disagreed a publisher would be refused by a regular expression that
 * gives no reason. This checks that something was sent.
 */
const key = nonEmpty;

// --- Shared vocabularies ---------------------------------------------------------

const schemaFieldType = z.enum([
  "string",
  "number",
  "boolean",
  "instant",
  "uuid",
  "object",
  "array",
]);
const compatibilityMode = z.enum(["backward", "forward", "full", "none"]);
const orderingGuarantee = z.enum(["none", "partition", "global"]);
const payloadRetention = z.enum(["none", "digest", "full"]);
const transportKind = z.enum(["in_process", "outbox", "kafka", "nats", "redpanda", "amqp"]);
const deliverySemantics = z.enum(["at_most_once", "at_least_once", "exactly_once"]);
const filterOperator = z.enum(["equals", "not_equals", "in", "prefix", "present", "absent"]);
const deadLetterReason = z.enum([
  "consumer_error",
  "payload_rejected",
  "timeout",
  "attempts_exhausted",
  "schema_unknown",
  "schema_incompatible",
  "transport_unavailable",
]);

/**
 * One field of an event type's schema.
 *
 * Deliberately shallow: a name, one of seven types, and whether it has to be there. The mesh publishes what a
 * consumer may rely on rather than a validator anybody executes, and a schema language rich enough to express
 * every payload the platform carries would become a second type system that has to agree with TypeScript. The
 * compatibility engine compares two of these lists and says whether a version is a safe successor, which is the
 * question a registry exists to answer, and it can answer it from exactly this much.
 */
const schemaField = z.object({
  name: nonEmpty,
  type: schemaFieldType,
  required: z.boolean(),
});

/**
 * One clause of a subscription's filter.
 *
 * `values` is unbounded below because two of the six operators take none: `present` and `absent` ask whether an
 * attribute is there at all, and requiring a value alongside them would make the schema demand something the
 * predicate would then ignore. The engine refuses a clause whose operator and value count disagree, naming the
 * attribute, which is a refusal somebody can act on — where a bare *expected at least one item* is not.
 *
 * Filters read envelope attributes and never a payload, and that is a property of the matching engine rather
 * than of this shape. It is worth stating here anyway, because a filter that could reach into a body would be a
 * way to select on institutional content from a scope that is not allowed to read it.
 */
const filterPredicate = z.object({
  attribute: nonEmpty,
  operator: filterOperator,
  values: z.array(z.string()),
});

// --- Event types -----------------------------------------------------------------

/**
 * Declare a kind of fact the platform is willing to carry (`mesh:govern`).
 *
 * `version` is optional because the registry assigns the first one, and a caller supplying it is stating which
 * successor they are writing rather than choosing a number freely — the aggregate refuses a version that is not
 * the next one after the highest published under the key. `compatibilityMode` is optional for the same reason
 * `style` is on a gateway contract: the default is what an unqualified declaration means, and here that is
 * backward compatibility, because the whole point of a version is that existing consumers keep working.
 *
 * `tenantId` is absent because it comes from the authenticated principal; see `actorOf` for why attribution is
 * never read from a body anywhere in this domain.
 */
export const defineEventTypeSchema = z.object({
  organizationId: uuid,
  eventTypeKey: key,
  version: count.optional(),
  title: nonEmpty,
  summary: nonEmpty,
  compatibilityMode: compatibilityMode.optional(),
  schemaFields: z.array(schemaField),
});

/**
 * Restate a draft version.
 *
 * The key and the version are absent because they identify the declaration rather than describe it, and a new
 * one of either is a new declaration. Everything else is replaced wholesale, including the field list: a schema
 * is one statement about what a fact looks like, and a partial edit would let a field be dropped by omission,
 * which is precisely the change the compatibility engine exists to have an opinion about.
 */
export const reviseEventTypeSchema = z.object({
  title: nonEmpty,
  summary: nonEmpty,
  compatibilityMode,
  schemaFields: z.array(schemaField),
});

/**
 * Announce that a version is going away, and say what to move to.
 *
 * Both instants are required and neither is a clock reading, because a deprecation is a dated promise: the
 * aggregate measures the notice between them and refuses one shorter than a consumer could act on, and a
 * retirement stamped from the server's clock at request time would make that notice unreviewable. The successor
 * version is compulsory for the same reason it is on a gateway contract — *this is going away* without *use
 * this instead* is an outage with a lead time, and here the consumers who would find out late are other
 * capabilities inside the platform rather than integrators who can be emailed.
 */
export const deprecateEventTypeSchema = z.object({
  announcedAt: isoDate,
  retireAt: isoDate,
  supersededByVersion: count,
});

/**
 * The instant a publication assessment is judged against (`mesh:read`).
 *
 * An argument rather than the server's clock, so the verdict is reproducible: the same question asked twice
 * about the same version gets the same answer, and *would this have been publishable last Tuesday* is a
 * question somebody can ask after an incident rather than a state that has already moved on.
 */
export const assessPublicationQuerySchema = z.object({ asOf: isoDate });

// --- Event streams ---------------------------------------------------------------

/**
 * Declare a channel the platform carries facts on (`mesh:govern`).
 *
 * Every field the package holds a default for is optional here, and the defaults stay in the package: ordering
 * per partition, eight partitions, digest retention and thirty days. That is not economy at the schema's
 * expense. A default restated in a request schema is a second opinion about what an unqualified stream means,
 * and the first time somebody changes one of them the two would disagree silently — a stream would be created
 * with a retention nobody chose and a promise the sweep would then keep.
 *
 * `partitionKeyPath` is nullable as well as optional, and null is its own answer: it means partition by the
 * aggregate id, which is what keeps two facts about one learner in order without any publisher knowing that
 * partitions exist. A path is the exception, used when a whole class register has to stay together.
 *
 * `eventTypeKeys` is what the stream will accept. The aggregate deduplicates and orders the list rather than
 * refusing a repeat, because a key sent twice is a form filled in twice and not a decision anybody made.
 */
export const defineEventStreamSchema = z.object({
  organizationId: uuid,
  streamKey: key,
  title: nonEmpty,
  summary: nonEmpty,
  ordering: orderingGuarantee.optional(),
  partitionCount: count.optional(),
  partitionKeyPath: nonEmpty.nullable().optional(),
  retention: payloadRetention.optional(),
  retentionSeconds: count.optional(),
  eventTypeKeys: z.array(key),
});

/**
 * Restate how a stream is divided, wholesale.
 *
 * All three fields are required where their equivalents on a definition are optional, because repartitioning is
 * a restatement rather than an edit: ordering, partition count and partition key path are one declaration, and
 * changing the count while leaving the path to a default would move every key to a different partition and
 * silently reorder facts about the same thing. `partitionKeyPath` is nullable and not optional here for the
 * same reason — *back to the aggregate id* has to be sayable, and it must not be spelled the same way as a
 * field somebody stopped filling in.
 *
 * The aggregate will only accept this on a draft. A live stream's partitioning is a promise its consumers have
 * already read, and the honest way to change it is a new stream that consumers move to deliberately.
 */
export const repartitionEventStreamSchema = z.object({
  ordering: orderingGuarantee,
  partitionCount: count,
  partitionKeyPath: nonEmpty.nullable(),
});

/**
 * Change how long, and how much of, what crossed this stream is kept (`mesh:govern`).
 *
 * The class and the window move together because they are one promise. Widening from a digest to a full body
 * does not retrieve the bodies of messages already carried, and narrowing from full to digest does not by
 * itself forget the ones still held — the sweep does that, under `mesh:operate`, honouring what was decided
 * here. Stating the pair in one request is what stops a stream from spending a week retaining bodies for a
 * duration nobody set.
 */
export const reviseStreamRetentionSchema = z.object({
  retention: payloadRetention,
  retentionSeconds: count,
});

/**
 * Add a kind of fact to what a stream carries, or take one away.
 *
 * One schema for both directions, because the bodies are the same shape and the asymmetry lives where it
 * belongs: accepting a type resolves it against the registry and refuses one that was never declared, while
 * withdrawing resolves nothing, so a type that has since been retired can always be taken off a stream.
 */
export const changeStreamEventTypeSchema = z.object({ eventTypeKey: key });

// --- Stream bindings -------------------------------------------------------------

/**
 * Attach a stream to something that will actually carry it (`mesh:deliver`).
 *
 * `transport` is optional and defaults to the transactional outbox, which is the transport the platform can
 * always honour: it is the one that commits with the fact it is carrying, so a message is never published for a
 * transaction that rolled back. Naming any other transport is a decision about infrastructure that exists, and
 * the registry refuses one this deployment does not serve rather than accepting a binding that would fail at
 * the first message.
 *
 * `transportRef` names where the transport's configuration is held and never the configuration itself. A
 * broker's credentials do not belong in a binding record, and a caller who pastes one here is writing a secret
 * into a table read by everything that inspects the mesh.
 */
export const declareStreamBindingSchema = z.object({
  organizationId: uuid,
  streamKey: key,
  transport: transportKind.optional(),
  transportRef: nonEmpty,
});

/**
 * Point a binding at different configuration for the same transport.
 *
 * The transport itself is not retargetable, and the restriction is the point. Moving a live binding from the
 * outbox to a broker changes the delivery guarantee under consumers who were told what it was; a different
 * cluster of the same kind does not. The second is an operational move, the first is a new binding somebody
 * declares and drains onto deliberately.
 */
export const retargetStreamBindingSchema = z.object({ transportRef: nonEmpty });

/**
 * Close a binding, stating what was left behind.
 *
 * The count is required rather than derived, because only the transport knows it — the mesh records that a
 * fact was accepted, not whether a broker has finished handing it on. A binding retired with undelivered
 * messages is a real and sometimes correct decision, and the number is what makes it a decision on the record
 * rather than something discovered later by a consumer that stopped hearing from a stream.
 */
export const retireStreamBindingSchema = z.object({ undeliveredMessages: count });

// --- Mesh subscriptions ----------------------------------------------------------

/**
 * Register a consumer of a stream (`mesh:deliver`).
 *
 * `consumerGroup` is what makes the subscription a unit of work rather than a connection: every reader in a
 * group shares one set of checkpoints, so adding a second process to a group divides the partitions instead of
 * doubling the deliveries. `semantics` and `maxAttempts` are optional and default in the package to at-least-
 * once and five, which is the arrangement a consumer that has not thought about it should get — a consumer that
 * may see a fact twice is one that can be made correct by being idempotent, and one that may miss a fact cannot
 * be made correct at all.
 *
 * `filter` is optional and an omitted filter means everything on the stream, which is the honest default: a
 * subscription that matched nothing until somebody added a clause would look registered and deliver silence.
 */
export const registerMeshSubscriptionSchema = z.object({
  organizationId: uuid,
  subscriptionKey: key,
  streamKey: key,
  consumerGroup: key,
  title: nonEmpty,
  semantics: deliverySemantics.optional(),
  maxAttempts: count.optional(),
  filter: z.array(filterPredicate).optional(),
});

/**
 * Replace what a subscription is interested in, wholesale.
 *
 * Wholesale rather than clause by clause, because a filter is one decision and its clauses are conjoined — a
 * partial edit would let a clause be dropped by omission and widen a subscription without anybody asking for
 * more. An empty array is accepted and means everything on the stream, which is how a filter is removed.
 */
export const refilterMeshSubscriptionSchema = z.object({ filter: z.array(filterPredicate) });

/**
 * Restate the delivery terms.
 *
 * The pair moves together because the attempt ceiling only means anything against the semantics it sits under:
 * exhausting attempts under at-least-once dead-letters the message, and under at-most-once there is nothing to
 * exhaust. Changing one without the other is how a consumer ends up with a ceiling that describes a delivery
 * arrangement it no longer has.
 */
export const reviseSubscriptionDeliverySchema = z.object({
  semantics: deliverySemantics,
  maxAttempts: count,
});

// --- Mesh messages ---------------------------------------------------------------

/**
 * Put a fact on a stream (`mesh:publish`).
 *
 * The shape is a domain event and the context a mesh needs to carry one, kept apart in the body exactly as the
 * completion engine keeps them apart: the event knows its type, its version, its identity and when it happened;
 * the boundary knows which stream is carrying it, which capability published it, what it is about and which
 * trace it belongs to. The controller hands both to `completeEnvelope` rather than assembling an envelope here,
 * so an HTTP publication inherits the same key normalisation, the same fixed-width instants and the same
 * refusals by name as an in-process one. A second assembly at this layer would be a second definition of what a
 * complete envelope is, and the first divergence between them would be a message that no replay could reproduce.
 *
 * `tenantId` is not a field. It comes from the authenticated principal, which is what stops a publisher from
 * writing a fact into another institution's stream by editing one line of a request body.
 *
 * `recordedAt` is optional and defaults to the clock at the composition root, because here the server's clock
 * is the honest answer: `recordedAt` is the moment the mesh took custody, retention runs from it, and the
 * moment custody passed is this request. `occurredAt` is required and is the producer's to state, because when
 * something happened is not something the mesh witnessed.
 *
 * `causationId` is nullable and not optional. A fact that begins a chain genuinely has nothing before it, and
 * that has to be sayable in a way that does not read like a field somebody stopped filling in — the causation
 * chain is what an investigation walks backwards, and a broken link in it looks exactly like a root cause.
 *
 * `payload` is optional because a stream may be governed to carry no body at all, and it is an object rather
 * than any JSON value because a payload the platform carries is a domain event's payload, which every publisher
 * in the platform renders as an object. `payloadDigest` is optional for the same reason and is how a
 * digest-retention stream keeps the ability to prove what it carried without keeping what it carried.
 */
export const recordMeshMessageSchema = z.object({
  eventId: uuid,
  eventTypeKey: key,
  eventTypeVersion: count,
  aggregateType: key,
  aggregateId: uuid,
  producerKey: key,
  correlationId: nonEmpty,
  causationId: uuid.nullable(),
  traceId: key,
  streamKey: key,
  partitionKey: nonEmpty.optional(),
  occurredAt: isoDate,
  recordedAt: isoDate.optional(),
  payloadDigest: nonEmpty.optional(),
  payload: z.record(z.unknown()).optional(),
});

/**
 * Forget the bodies one stream is no longer promising to keep (`mesh:operate`).
 *
 * The stream is named in the body rather than the path because a sweep is an operation rather than a read of a
 * resource, which is the same reason the gateway's quarantine sweep takes its subject the same way. `asOf` is
 * an argument rather than a clock reading so that one run judges its whole batch against one moment: a message
 * whose retention expires on the boundary is in this run or the next one, never in both, and a sweep can be
 * re-run against a past instant to establish what it would have forgotten.
 *
 * Nothing is deleted that the stream did not already promise to forget, and running this twice does the work
 * once — the second pass finds no held bodies old enough, because the first pass cleared them.
 */
export const sweepRetentionSchema = z.object({
  streamKey: key,
  asOf: isoDate,
});

/**
 * The window a message read is bounded by (`mesh:read`).
 *
 * Both ends are required, and there is no unbounded form of this read. The table behind it is the largest the
 * platform holds, and a read that could omit a bound is one somebody will eventually omit both bounds on. Both
 * ends are inclusive, matching the package's own predicate, because a caller naming an hour means the hour.
 *
 * The bounds are compared against when the mesh took custody and never against when the fact occurred, which is
 * the same rule retention runs by. A window bounded by occurrence would ask for messages retained outside it,
 * and a replay planned from it would be refused for a breach it did not commit.
 */
export const messageWindowQuerySchema = z.object({
  streamKey: key,
  fromInstant: isoDate,
  toInstant: isoDate,
});

// --- Subscription checkpoints ----------------------------------------------------

/**
 * Start recording where a consumer has got to on one partition (`mesh:operate`).
 *
 * A checkpoint is opened per partition rather than per subscription, and the shape is load-bearing rather than
 * bookkeeping. A subscription summarised to one position is one whose single dead partition is averaged away by
 * seven healthy ones, and the seven are what somebody looks at before deciding nothing is wrong.
 */
export const openCheckpointSchema = z.object({
  subscriptionId: uuid,
  partition: count,
});

/**
 * Record that a consumer has finished everything up to a position.
 *
 * Forward only, which the aggregate enforces: a commit below the position already held is refused rather than
 * applied, because the two ways it happens are an out-of-order acknowledgement and a consumer that restarted
 * with stale state, and in both cases obeying it would re-deliver work that was already done.
 */
export const commitCheckpointSchema = z.object({ position: count });

/**
 * Move a consumer's position deliberately, including backwards.
 *
 * The reason is required because this is the operation a commit refuses to be. Rewinding a checkpoint
 * re-delivers everything after the new position to a consumer that has already acted on it, which on a busy
 * stream is the largest thing anybody can do here by accident — and the actor is taken from the principal, so
 * what is written down is who did it and why, not who typed a name into a field.
 */
export const resetCheckpointSchema = z.object({
  position: count,
  reason: nonEmpty,
});

/**
 * The instant a lag assessment is judged against (`mesh:read`).
 *
 * An argument rather than a clock reading, so a band is reproducible: *was this consumer stalled at nine this
 * morning* is a question worth being able to ask after an incident, and a reading taken from the server's clock
 * can only ever answer for now.
 */
export const assessLagQuerySchema = z.object({ asOf: isoDate });

// --- Dead letters ----------------------------------------------------------------

/**
 * Record that a consumer could not act on a message (`mesh:operate`).
 *
 * `reason` is one of seven rather than free text, because this field is read by machines and by mornings: it is
 * what separates *the consumer's code threw* from *the transport was down* from *the schema is not one we
 * know*, and those have different remedies and different people. A free-text reason would make the queue
 * unsortable exactly when it is longest.
 *
 * `failedAt` and `traceId` are required and neither is defaulted. The caller here is a delivery worker rather
 * than a screen, and a worker that let the server stamp the failure could not say afterwards when the consumer
 * actually broke — the gap between the failure and the report is the interesting part when a queue backs up.
 * The trace is what joins this record to the attempt that produced it, and a dead letter without one is a
 * failure nobody can go and read.
 */
export const recordDeadLetterSchema = z.object({
  subscriptionId: uuid,
  messageId: uuid,
  reason: deadLetterReason,
  attempts: count,
  traceId: key,
  failedAt: isoDate,
});

/**
 * Settle a dead letter by pointing at the replay that will carry the message again.
 *
 * The replay is named rather than started here, and the separation is deliberate: replaying is `mesh:replay`,
 * this is `mesh:operate`, and an operator clearing a queue should not be able to re-deliver history as a side
 * effect of tidying up. The aggregate refuses a replay that is not the one covering this message, so the field
 * is a reference to a decision somebody else made rather than a way of making it.
 */
export const replayDeadLetterSchema = z.object({ replayId: uuid });

/**
 * Give up on a message for good.
 *
 * The reason is the whole point of the operation. A dead letter is the mesh saying a consumer never acted on a
 * fact; a discard is a person saying it never will, and the only thing separating a considered decision from a
 * queue somebody cleared before a meeting is what they wrote here.
 */
export const discardDeadLetterSchema = z.object({ reason: nonEmpty });

// --- Replay requests -------------------------------------------------------------

/**
 * Ask for a window of history to be delivered again (`mesh:replay`).
 *
 * `requestedBy` is absent because it comes from the authenticated principal, and here that is not merely the
 * house rule — a replay may not be approved by the person who asked for it, and the aggregate enforces that by
 * comparing the two. A requester a caller could type in would not record the wrong name, it would defeat the
 * rule outright.
 *
 * The reason is required at the point of asking rather than at the point of approving, because the approver's
 * whole job is to weigh it. A request that arrives without one asks somebody to authorise re-delivering facts a
 * consumer has already acted on, on trust.
 */
export const requestReplaySchema = z.object({
  subscriptionId: uuid,
  fromInstant: isoDate,
  toInstant: isoDate,
  reason: nonEmpty,
});

/**
 * Agree that a window may be re-delivered.
 *
 * `asOf` is what the retention check is made against, and it is an argument rather than the server's clock so
 * that the decision is reproducible: the window a stream could still honestly serve shrinks continuously, and
 * an approval that cannot say which moment it was judged at cannot be reviewed afterwards. The approver is the
 * principal, never a field.
 */
export const approveReplaySchema = z.object({ asOf: isoDate });

/**
 * Refuse a request, or withdraw one.
 *
 * One schema for both, because the bodies are the same and the difference is who is acting rather than what
 * they send — and both owe the same explanation to the same person. A rejection is somebody being told their
 * window will not be served; a cancellation is somebody saying they no longer need it. The aggregate keeps them
 * as different statuses, which is what lets *this was refused* and *this was dropped* stay different facts.
 */
export const settleReplaySchema = z.object({ reason: nonEmpty });

/**
 * Record that a replay finished, and how much actually went.
 *
 * The count is the worker's to state rather than the platform's to assume. What was planned and what was
 * delivered differ whenever a subscription is paused mid-run or a filter excludes part of the window, and the
 * difference between the two numbers is the first thing anybody asks about a replay that did not fix what it
 * was meant to fix.
 */
export const completeReplaySchema = z.object({ deliveredCount: count });

/**
 * Record that a replay stopped short.
 *
 * Both fields, because a failure is only useful with both halves. The count says how much of the window a
 * consumer has now seen twice, which decides whether the remedy is to resume, to start again or to leave it;
 * the reason says why it stopped, which decides whether starting again would do anything at all.
 */
export const failReplaySchema = z.object({
  deliveredCount: count,
  reason: nonEmpty,
});
